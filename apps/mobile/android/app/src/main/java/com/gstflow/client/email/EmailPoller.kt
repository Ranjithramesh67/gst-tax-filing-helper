package com.gstflow.client.email

import android.content.Context
import android.util.Log

/**
 * Drives one poll cycle: for each enabled account it reads new candidate mail
 * through the provider connector, runs [OtpExtractor], enqueues the result in
 * [EmailOtpOutbox], advances the persisted cursor and attempts an immediate
 * upload. Anything left in the outbox is drained later by
 * [EmailRetryJobService].
 *
 * All work here does network I/O and must run off the main thread (the SMS
 * foreground service owns that dispatch). The orchestration is separated from
 * Android so it can be unit-tested with fake connectors and an in-memory sink;
 * see [pollAll] and [mapMail].
 */
object EmailPoller {
    private const val TAG = "EmailPoller"

    /** Foreground-service cadence: at most one poll per 15 minutes. */
    const val DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000L

    private const val POLL_PREFS = "gstflow_email_poll"
    private const val KEY_LAST_POLL = "last_poll"

    /**
     * Polls every enabled account immediately. The caller is responsible for
     * running this off the main thread.
     */
    fun pollAll(context: Context) {
        // Email reading is off by default. Nothing may be read (or uploaded)
        // until the user has granted consent, which JS mirrors into sync prefs
        // via EmailAccountModule.setConsent(true).
        if (!EmailAccounts.isConsentGranted(context)) {
            Log.i(TAG, "Email-reading consent not granted; skipping poll")
            return
        }

        val sink = EmailOtpOutbox.store(context)
        val accounts = try {
            EmailAccounts.list()
        } catch (error: Exception) {
            Log.w(TAG, "Email accounts unavailable: ${error.message}")
            return
        }

        pollAll(
            accounts = accounts,
            connectorFactory = ::connectorFor,
            sink = sink,
            upload = { item -> EmailUploader.upload(context, item) },
            onCursor = { id, cursor -> EmailAccounts.setCursor(id, cursor) },
            onStatus = { id, at, error -> EmailAccounts.markStatus(id, at, error) },
        )

        // A failed upload leaves the item in the outbox; schedule the durable
        // retry job so it drains once connectivity returns. A leftover item from
        // an earlier run is retried too.
        if (sink.size() > 0) EmailRetryJobService.schedule(context)
    }

    /**
     * Throttled entry point used by the foreground-service tick. Returns true
     * when a poll was actually attempted, false when still inside the
     * [DEFAULT_POLL_INTERVAL_MS] window.
     */
    fun pollIfDue(context: Context): Boolean {
        val prefs = context.getSharedPreferences(POLL_PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong(KEY_LAST_POLL, 0L) < DEFAULT_POLL_INTERVAL_MS) return false
        prefs.edit().putLong(KEY_LAST_POLL, now).apply()
        pollAll(context)
        return true
    }

    /**
     * Selects the connector for an account. Only IMAP is implemented so far;
     * GMAIL/GRAPH arrive in Tasks 15-16 and are skipped (with a clear log)
     * rather than failing the whole poll.
     */
    internal fun connectorFor(account: EmailAccount): EmailConnector? =
        when (account.provider) {
            EmailProvider.IMAP -> ImapConnector(account)
            EmailProvider.GMAIL, EmailProvider.GRAPH -> {
                Log.i(TAG, "Provider ${account.provider} not implemented yet; skipping ${account.id}")
                null
            }
        }

    /**
     * Pure orchestration over a list of accounts. Skipped accounts are disabled,
     * have no connector (provider not implemented), or email consent is off
     * ([consentGranted] = false), in which case nothing is read or uploaded.
     * Returns true when at least one extracted OTP failed to upload, so the
     * caller should retry.
     */
    internal fun pollAll(
        accounts: List<EmailAccount>,
        connectorFactory: (EmailAccount) -> EmailConnector?,
        sink: EmailOtpSink,
        upload: (EmailOtp) -> Boolean,
        onCursor: (String, String) -> Unit,
        onStatus: (String, Long?, String?) -> Unit,
        consentGranted: Boolean = true,
    ): Boolean {
        // The consent gate lives here too so the pure orchestration is testable
        // without Android: with consent off no account is ever read or uploaded.
        if (!consentGranted) return false

        var needsRetry = false
        for (account in accounts) {
            if (!account.enabled) continue
            val connector = connectorFactory(account) ?: continue
            if (pollAccount(account, connector, sink, upload, onCursor, onStatus)) needsRetry = true
        }
        return needsRetry
    }

    private fun pollAccount(
        account: EmailAccount,
        connector: EmailConnector,
        sink: EmailOtpSink,
        upload: (EmailOtp) -> Boolean,
        onCursor: (String, String) -> Unit,
        onStatus: (String, Long?, String?) -> Unit,
    ): Boolean {
        val now = System.currentTimeMillis()
        val mails = try {
            connector.listOtpCandidates(account.cursor)
        } catch (error: Exception) {
            // A failed read must not advance the cursor, otherwise the messages
            // would be skipped forever. Record the error and move on.
            Log.w(TAG, "Poll failed for ${account.id}: ${error.message}")
            onStatus(account.id, now, error.message ?: "poll failed")
            return false
        }

        val extracted = ArrayList<EmailOtp>(mails.size)
        for (mail in mails) {
            mapMail(account, mail)?.let { item ->
                sink.add(item)
                extracted.add(item)
            }
        }

        connector.newCursor(mails)?.let { onCursor(account.id, it) }

        var needsRetry = false
        for (item in extracted) {
            if (upload(item)) {
                sink.remove(setOf(item.sourceRef))
            } else {
                needsRetry = true
            }
        }

        onStatus(account.id, now, null)
        return needsRetry
    }

    /**
     * Runs the OTP extractor over the bounded body and maps a matched mail to an
     * outbox item. Returns null when the mail has no OTP. Kept side-effect free
     * so the extraction mapping can be asserted directly in tests.
     */
    internal fun mapMail(account: EmailAccount, mail: RawMail): EmailOtp? {
        val extracted = OtpExtractor.extract(mail.snippetBody) ?: return null
        return EmailOtp(
            code = extracted.code,
            fromAddress = mail.from,
            subject = mail.subject,
            snippet = extracted.snippet,
            receivedAt = mail.receivedAt,
            sourceRef = mail.messageId,
            accountId = account.id,
        )
    }
}
