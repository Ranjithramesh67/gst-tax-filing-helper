package com.gstflow.client.email

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.JSONArguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import java.util.UUID

/**
 * Input validation for the account bridge. Pure and side-effect free so the
 * rules are unit-testable without Android; the ReactMethod merely forwards the
 * returned message on rejection.
 */
internal object EmailAccountValidation {
    /** Returns a human-readable reason, or null when the IMAP input is usable. */
    fun validateImap(address: String?, password: String?, host: String?, port: Int): String? {
        if (address.isNullOrBlank()) return "address must not be blank"
        if (!address.contains('@') || address.any { it.isWhitespace() }) {
            return "address must be a valid email"
        }
        if (password.isNullOrBlank()) return "password must not be blank"
        if (host.isNullOrBlank() || host.any { it.isWhitespace() }) {
            return "host must not be blank"
        }
        if (port !in 1..65535) return "port must be between 1 and 65535"
        return null
    }
}

/**
 * React Native bridge for linked email accounts.
 *
 * Surface:
 *  - addImapAccount(address, password, host, port): Promise<{ok:true}>
 *  - listAccounts(): Promise<Array<EmailAccountMetadata>>  (never secrets)
 *  - removeAccount(id): Promise<{ok:true}>
 *  - setEnabled(id, enabled): Promise<{ok:true}>
 *  - setConsent(enabled): Promise<boolean>   (gates the native poller)
 *  - linkGmail(): Promise<{ok:true}>          (launches [GmailLinkActivity])
 *  - linkGraph(): Task 16, rejected as NOT_IMPLEMENTED here
 *
 * The IMAP password is written straight into [EmailAccounts]'
 * EncryptedSharedPreferences via [EmailAccount.secretRef]; it is never logged
 * and never returned to JS. [listAccounts] uses [EmailAccount.toPublicJson] so
 * `secretRef`/`oauthTokenJson` cannot leak across the bridge.
 */
class EmailAccountModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    /** Set while a Gmail/OAuth link activity is in flight. */
    private var pendingGmailPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun addImapAccount(address: String, password: String, host: String, port: Int, promise: Promise) {
        EmailAccountValidation.validateImap(address, password, host, port)?.let { reason ->
            promise.reject("INVALID_ARGUMENT", reason)
            return
        }
        try {
            EmailAccounts.save(
                EmailAccount(
                    id = UUID.randomUUID().toString(),
                    provider = EmailProvider.IMAP,
                    address = address.trim(),
                    imapHost = host.trim(),
                    imapPort = port,
                    secretRef = password,
                    cursor = null,
                    enabled = true,
                ),
            )
            // Fire-and-forget: the bridge thread must not block on network I/O.
            kickPoll()
            promise.resolve(okResult())
        } catch (error: Exception) {
            promise.reject("ADD_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun listAccounts(promise: Promise) {
        try {
            val array = JSONArray()
            for (account in EmailAccounts.list()) array.put(account.toPublicJson())
            promise.resolve(JSONArguments.fromJSONArray(array))
        } catch (error: Exception) {
            promise.reject("LIST_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun removeAccount(id: String, promise: Promise) {
        if (id.isBlank()) {
            promise.reject("INVALID_ARGUMENT", "id must not be blank")
            return
        }
        try {
            EmailAccounts.remove(id)
            promise.resolve(okResult())
        } catch (error: Exception) {
            promise.reject("REMOVE_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun setEnabled(id: String, enabled: Boolean, promise: Promise) {
        if (id.isBlank()) {
            promise.reject("INVALID_ARGUMENT", "id must not be blank")
            return
        }
        try {
            EmailAccounts.setEnabled(id, enabled)
            promise.resolve(okResult())
        } catch (error: Exception) {
            promise.reject("SET_ENABLED_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun setConsent(enabled: Boolean, promise: Promise) {
        try {
            EmailAccounts.setConsent(reactContext, enabled)
            if (enabled) kickPoll()
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("CONSENT_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun linkGmail(promise: Promise) {
        reactContext.runOnUiQueueThread {
            val activity = currentActivity
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "No foreground activity to start Gmail linking")
                return@runOnUiQueueThread
            }
            if (pendingGmailPromise != null) {
                promise.reject("IN_PROGRESS", "A Gmail link is already in progress")
                return@runOnUiQueueThread
            }
            pendingGmailPromise = promise
            try {
                activity.startActivityForResult(
                    Intent(activity, GmailLinkActivity::class.java),
                    REQUEST_GMAIL_LINK,
                )
            } catch (error: Exception) {
                pendingGmailPromise = null
                promise.reject("LINK_FAILED", error.message, error)
            }
        }
    }

    @ReactMethod
    fun linkGraph(promise: Promise) {
        promise.reject("NOT_IMPLEMENTED", "Microsoft Graph linking ships in Task 16")
    }

    override fun onActivityResult(
        activity: Activity?,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
    ) {
        if (requestCode != REQUEST_GMAIL_LINK) return
        val promise = pendingGmailPromise ?: return
        pendingGmailPromise = null
        if (resultCode == Activity.RESULT_OK) {
            // The token lives only in the encrypted store; the bridge sees just ok.
            kickPoll()
            promise.resolve(okResult())
        } else {
            val reason = data?.getStringExtra(GmailLinkActivity.EXTRA_ERROR)
                ?: "Gmail linking was cancelled"
            promise.reject("LINK_CANCELLED", reason)
        }
    }

    override fun onNewIntent(intent: Intent?) = Unit

    private fun kickPoll() {
        Thread { EmailPoller.pollAll(reactContext.applicationContext) }.start()
    }

    private fun okResult(): WritableMap = Arguments.createMap().apply { putBoolean("ok", true) }

    companion object {
        const val NAME = "EmailAccounts"
        private const val REQUEST_GMAIL_LINK = 48151
    }
}
