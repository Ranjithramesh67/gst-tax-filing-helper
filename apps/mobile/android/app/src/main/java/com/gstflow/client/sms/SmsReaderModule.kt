package com.gstflow.client.sms

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persistent, capped store for filtered SMS received while JS was not attached
 * (process cold, app backgrounded). Drained into JS the next time
 * startListening()/flushPending() runs. Duplicate delivery is harmless because
 * the JS encrypted queue and the server both de-duplicate by hash.
 */
object SmsBuffer {
    private const val PREFS = "gstflow_sms_buffer"
    private const val KEY = "pending"
    private const val MAX_ITEMS = 500

    @Synchronized
    fun append(context: Context, sms: IncomingSms) {
        val array = read(context)
        array.put(
            JSONObject().apply {
                put("sender", sms.sender)
                put("body", sms.body)
                put("receivedAt", sms.receivedAtMillis)
            },
        )
        while (array.length() > MAX_ITEMS) {
            array.remove(0)
        }
        write(context, array)
    }

    @Synchronized
    fun drain(context: Context): List<IncomingSms> {
        val array = read(context)
        val out = ArrayList<IncomingSms>(array.length())
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            out.add(
                IncomingSms(
                    sender = item.optString("sender", ""),
                    body = item.optString("body", ""),
                    receivedAtMillis = item.optLong("receivedAt", System.currentTimeMillis()),
                ),
            )
        }
        write(context, JSONArray())
        return out
    }

    @Synchronized
    fun size(context: Context): Int = read(context).length()

    private fun read(context: Context): JSONArray {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
        if (raw.isNullOrEmpty()) return JSONArray()
        return try {
            JSONArray(raw)
        } catch (error: Exception) {
            JSONArray()
        }
    }

    private fun write(context: Context, array: JSONArray) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, array.toString())
            .apply()
    }
}

/**
 * React Native bridge for the Android SMS reader.
 *
 * Surface:
 *  - requestSmsPermission(): Promise<boolean>
 *  - hasSmsPermission(): Promise<boolean>
 *  - startListening(): Promise<boolean>   (drains the native buffer; no persistent service)
 *  - stopListening(): Promise<boolean>
 *  - getRecentGstSms(limit): Promise<Array<{sender, body, receivedAt, receivedAtIso, hash}>>
 *  - setConsent(enabled): Promise<boolean>  (mirrors consent to native cache)
 *  - flushPending(): Promise<number>
 *  - clearNotification(): Promise<boolean>  (removes the transient ingest notification)
 *  - isIgnoringBatteryOptimizations(): Promise<boolean>
 *  - requestIgnoreBatteryOptimizations(): Promise<boolean>
 *  - openBatteryOptimizationSettings(): Promise<boolean>
 *  - openAutoStartSettings(): Promise<boolean>
 *  - getDeviceManufacturer(): Promise<string>
 *  - event: onSmsReceived -> {sender, body, receivedAt, receivedAtIso, hash}
 */
class SmsReaderModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext),
    PermissionListener {

    override fun getName(): String = NAME

    init {
        instance = this
    }

    override fun invalidate() {
        if (instance === this) instance = null
        super.invalidate()
    }

    // Required by NativeEventEmitter on some platforms.
    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) = Unit

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) = Unit

    @ReactMethod
    fun requestSmsPermission(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity to request SMS permission")
            return
        }
        val permissionAware = activity as? PermissionAwareActivity
        if (permissionAware == null) {
            promise.reject("NO_ACTIVITY", "Host activity is not permission-aware")
            return
        }
        pendingPermissionPromise = promise
        activity.runOnUiThread {
            try {
                permissionAware.requestPermissions(
                    arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS),
                    SMS_PERMISSION_REQUEST_CODE,
                    this,
                )
            } catch (error: Exception) {
                pendingPermissionPromise = null
                promise.reject("REQUEST_FAILED", error.message, error)
            }
        }
    }

    @ReactMethod
    fun hasSmsPermission(promise: Promise) {
        promise.resolve(SmsPermissions.hasSmsPermission(reactContext))
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        promise.resolve(BatteryOptimization.isIgnoringOptimizations(reactContext))
    }

    @ReactMethod
    fun getDeviceManufacturer(promise: Promise) {
        promise.resolve(BatteryOptimization.manufacturer())
    }

    /**
     * Launches the system "ignore battery optimizations" dialog and resolves
     * once it has been shown. The caller should re-check
     * `isIgnoringBatteryOptimizations` when the app returns to the foreground.
     */
    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            promise.resolve(BatteryOptimization.requestExemption(reactContext))
        } catch (error: Exception) {
            promise.reject("BATTERY_REQUEST_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun openBatteryOptimizationSettings(promise: Promise) {
        try {
            promise.resolve(BatteryOptimization.openOptimizationSettings(reactContext))
        } catch (error: Exception) {
            promise.reject("BATTERY_SETTINGS_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun openAutoStartSettings(promise: Promise) {
        try {
            promise.resolve(BatteryOptimization.openAutoStartSettings(reactContext))
        } catch (error: Exception) {
            promise.reject("AUTOSTART_SETTINGS_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun startListening(promise: Promise) {
        try {
            // Capture is driven by the manifest SMS receiver and the consent
            // gate; there is no persistent service to start. Draining the
            // buffer hands any SMS captured while JS was down to the subscriber.
            flushBuffer()
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("START_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        try {
            reactContext.stopService(Intent(reactContext, SmsForegroundService::class.java))
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("STOP_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun clearNotification(promise: Promise) {
        try {
            SmsForegroundService.clearNotification(reactContext)
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("CLEAR_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun setConsent(enabled: Boolean, promise: Promise) {
        SmsConsent.cache(reactContext, enabled)
        promise.resolve(true)
    }

    /**
     * Mirrors the signed-in access token (and device id) into SharedPreferences so
     * the native SMS uploader can forward messages with no JS running. Passing a
     * null/blank token clears it (sign-out / consent revocation).
     */
    @ReactMethod
    fun setSyncCredentials(accessToken: String?, deviceId: String?, promise: Promise) {
        try {
            val editor = reactContext
                .getSharedPreferences(SYNC_PREFS, Context.MODE_PRIVATE)
                .edit()
            if (accessToken.isNullOrBlank()) {
                editor.remove(PREF_ACCESS_TOKEN)
            } else {
                editor.putString(PREF_ACCESS_TOKEN, accessToken)
            }
            if (!deviceId.isNullOrBlank()) {
                editor.putString(PREF_DEVICE_ID, deviceId)
            }
            editor.apply()
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("CREDENTIALS_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun flushPending(promise: Promise) {
        val drained = SmsBuffer.drain(reactContext)
        for (sms in drained) emit(sms)
        promise.resolve(drained.size)
    }

    @ReactMethod
    fun getRecentGstSms(limit: Int, promise: Promise) {
        if (!SmsPermissions.hasSmsPermission(reactContext)) {
            promise.reject("PERMISSION_DENIED", "READ_SMS permission is not granted")
            return
        }
        val max = if (limit <= 0) 50 else limit
        val result = Arguments.createArray()
        try {
            reactContext.contentResolver.query(
                Uri.parse("content://sms/inbox"),
                arrayOf("address", "body", "date"),
                null,
                null,
                "date DESC",
            ).use { cursor ->
                if (cursor == null) {
                    promise.reject("QUERY_FAILED", "SMS inbox query returned no cursor")
                    return
                }
                val senderIndex = cursor.getColumnIndex("address")
                val bodyIndex = cursor.getColumnIndex("body")
                val dateIndex = cursor.getColumnIndex("date")
                var scanned = 0
                while (cursor.moveToNext() && result.size() < max && scanned < MAX_INBOX_SCAN) {
                    scanned += 1
                    val body = if (bodyIndex >= 0) cursor.getString(bodyIndex) else null
                    if (body.isNullOrEmpty()) continue
                    val sender = if (senderIndex >= 0) cursor.getString(senderIndex) ?: "" else ""
                    if (!GstFilter.isGstRelated(body, sender)) continue
                    val receivedAt = if (dateIndex >= 0) cursor.getLong(dateIndex) else System.currentTimeMillis()
                    result.pushMap(toMap(IncomingSms(sender, body, receivedAt)))
                }
            }
            promise.resolve(result)
        } catch (error: Exception) {
            promise.reject("QUERY_FAILED", error.message, error)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ): Boolean {
        if (requestCode != SMS_PERMISSION_REQUEST_CODE) return false
        val granted = grantResults.isNotEmpty() &&
            grantResults.all { it == PackageManager.PERMISSION_GRANTED }
        pendingPermissionPromise?.resolve(granted)
        pendingPermissionPromise = null
        return true
    }

    private fun flushBuffer() {
        for (sms in SmsBuffer.drain(reactContext)) {
            emit(sms)
        }
    }

    private fun emit(sms: IncomingSms) {
        if (!reactContext.hasActiveReactInstance()) {
            SmsBuffer.append(reactContext, sms)
            return
        }
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_NAME, toMap(sms))
        } catch (error: Exception) {
            SmsBuffer.append(reactContext, sms)
        }
    }

    private fun toMap(sms: IncomingSms): WritableMap =
        Arguments.createMap().apply {
            putString("sender", sms.sender)
            putString("body", sms.body)
            putDouble("receivedAt", sms.receivedAtMillis.toDouble())
            putString("receivedAtIso", sms.receivedAtIso)
            putString("hash", sms.hash)
        }

    private var pendingPermissionPromise: Promise? = null

    companion object {
        const val NAME = "SmsReader"
        const val EVENT_NAME = "onSmsReceived"
        private const val SMS_PERMISSION_REQUEST_CODE = 7301
        private const val MAX_INBOX_SCAN = 1000

        // Shared with SmsUploader/SmsConsent.
        const val SYNC_PREFS = "gstflow_client_prefs"
        const val PREF_ACCESS_TOKEN = "access_token"
        const val PREF_DEVICE_ID = "device_id"

        @Volatile
        private var instance: SmsReaderModule? = null

        /**
         * Called by the foreground service. Emits to JS when a React instance is
         * attached, otherwise persists to the native buffer for a later drain.
         */
        fun dispatch(context: Context, sms: IncomingSms) {
            val module = instance
            if (module != null && module.reactContext.hasActiveReactInstance()) {
                module.emit(sms)
            } else {
                SmsBuffer.append(context.applicationContext, sms)
            }
        }
    }
}
