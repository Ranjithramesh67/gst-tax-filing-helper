package com.gstflow.client.sms

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.provider.Telephony
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * A GST-relevant SMS extracted from the device. Repeated parts of a multipart
 * SMS are concatenated before construction.
 */
data class IncomingSms(
    val sender: String,
    val body: String,
    val receivedAtMillis: Long,
) {
    val receivedAtIso: String get() = GstFilter.toIso(receivedAtMillis)
    val hash: String get() = GstFilter.hashMessage(sender, body, receivedAtIso)
}

/**
 * Kotlin mirror of apps/api/src/sms/sms-parser.ts and the JS
 * apps/mobile/src/lib/gstFilter.ts. The capture rule and the classification
 * pattern order must stay identical so the on-device pre-filter and the
 * server-side classifier agree.
 *
 * Capture rule: a message is GST-related when the sender (header) or the body
 * contains "gst" (case-insensitive), covering GST, GSTIN, GSTR and GSTN.
 */
object GstFilter {
    private val RETURN_PATTERNS = listOf(
        Regex("""\bgstr[\s-]*(?:1|3b|9)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bgstr\b""", RegexOption.IGNORE_CASE),
        Regex("""\breturn\s+(?:filed|due|filing)\b""", RegexOption.IGNORE_CASE),
        Regex("""\bfiling\b""", RegexOption.IGNORE_CASE),
    )

    private val EWAY_PATTERNS = listOf(
        Regex("""\be-?way\b""", RegexOption.IGNORE_CASE),
        Regex("""\bewb\b""", RegexOption.IGNORE_CASE),
        Regex("""\bway\s*bill\b""", RegexOption.IGNORE_CASE),
    )

    private val PAYMENT_PATTERNS = listOf(
        Regex("""\bchallan\b""", RegexOption.IGNORE_CASE),
        Regex("""\bpmt\b""", RegexOption.IGNORE_CASE),
        Regex("""\bpaid\b""", RegexOption.IGNORE_CASE),
        Regex("""\bpayment\b""", RegexOption.IGNORE_CASE),
    )

    private val NOTICE_PATTERNS = listOf(
        Regex("""\bnotice\b""", RegexOption.IGNORE_CASE),
        Regex("""\bdemand\b""", RegexOption.IGNORE_CASE),
        Regex("""\basmt\b""", RegexOption.IGNORE_CASE),
        Regex("""\bshow\s*cause\b""", RegexOption.IGNORE_CASE),
        Regex("""\bdrc\b""", RegexOption.IGNORE_CASE),
    )

    private val INVOICE_PATTERNS = listOf(
        Regex("""\binvoice\b""", RegexOption.IGNORE_CASE),
        Regex("""\bbill\b""", RegexOption.IGNORE_CASE),
        Regex("""\bhsgst\b""", RegexOption.IGNORE_CASE),
    )

    private val ISO_FORMAT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    fun isGstRelated(body: String?, sender: String? = null): Boolean =
        (body ?: "").lowercase(Locale.ROOT).contains("gst") ||
            (sender ?: "").lowercase(Locale.ROOT).contains("gst")

    fun classify(body: String?, sender: String? = null): String {
        val text = "${body ?: ""} ${sender ?: ""}"
        if (matches(RETURN_PATTERNS, text)) return "GST_RETURN"
        if (matches(EWAY_PATTERNS, text)) return "EWAY_BILL"
        if (matches(PAYMENT_PATTERNS, text)) return "TAX_PAYMENT"
        if (matches(NOTICE_PATTERNS, text)) return "GST_NOTICE"
        if (matches(INVOICE_PATTERNS, text)) return "GST_INVOICE"
        if (isGstRelated(text)) return "UNCLASSIFIED"
        return "OTHER"
    }

    fun hashMessage(sender: String, body: String, receivedAtIso: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val bytes = digest.digest("$sender|$body|$receivedAtIso".toByteArray(Charsets.UTF_8))
        val out = StringBuilder(bytes.size * 2)
        for (b in bytes) out.append("%02x".format(b))
        return out.toString()
    }

    @Synchronized
    fun toIso(millis: Long): String = ISO_FORMAT.format(Date(millis))

    private fun matches(patterns: List<Regex>, text: String): Boolean =
        patterns.any { it.containsMatchIn(text) }
}

/**
 * Reads the in-app consent flag. The JS layer owns the source of truth in
 * AsyncStorage key `gstflow.mobile.consent`, read here directly so the receiver
 * can honour it without any JS running. AsyncStorage 2.x persists to
 * `AsyncStorage`/`Storage`; older builds use `RKStorage`/`catalystLocalStorage`,
 * so both stores are checked. SharedPreferences is a secondary cache that JS
 * mirrors through SmsReaderModule.setConsent().
 */
object SmsConsent {
    const val CONSENT_KEY = "gstflow.mobile.consent"
    private const val PREFS = "gstflow_client_prefs"
    private const val PREF_CONSENT = "consent"

    fun isGranted(context: Context): Boolean {
        readFromAsyncStorage(context)?.let { return it }
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return prefs.getBoolean(PREF_CONSENT, false)
    }

    fun cache(context: Context, granted: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(PREF_CONSENT, granted)
            .apply()
    }

    private fun readFromAsyncStorage(context: Context): Boolean? {
        val stores = listOf(
            CURRENT_ASYNC_STORAGE_DB to CURRENT_ASYNC_STORAGE_TABLE,
            LEGACY_ASYNC_STORAGE_DB to LEGACY_ASYNC_STORAGE_TABLE,
        )
        for ((dbName, table) in stores) {
            val dbFile = context.getDatabasePath(dbName)
            // No such AsyncStorage store on this install: try the next one.
            if (!dbFile.exists()) continue
            try {
                SQLiteDatabase.openDatabase(dbFile.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                    db.query(table, arrayOf("value"), "key = ?", arrayOf(CONSENT_KEY), null, null, null).use { cursor ->
                        // A matching row is authoritative; a missing key in one
                        // store must not mask a value in the other or the cache.
                        if (cursor.moveToFirst()) return parseConsent(cursor.getString(0))
                    }
                }
            } catch (error: Exception) {
                Log.w(TAG, "Unable to read consent from $dbName: ${error.message}")
            }
        }
        return null
    }

    private fun parseConsent(raw: String?): Boolean {
        if (raw == null) return false
        val trimmed = raw.trim()
        if (trimmed.startsWith("{")) {
            try {
                return JSONObject(trimmed).optBoolean("accepted", false)
            } catch (_: Exception) {
                // fall through to scalar parsing
            }
        }
        val normalized = trimmed.trim('"').lowercase(Locale.ROOT)
        return normalized == "true" ||
            normalized == "1" ||
            normalized == "yes" ||
            normalized == "accepted"
    }

    private const val CURRENT_ASYNC_STORAGE_DB = "AsyncStorage"
    private const val CURRENT_ASYNC_STORAGE_TABLE = "Storage"
    private const val LEGACY_ASYNC_STORAGE_DB = "RKStorage"
    private const val LEGACY_ASYNC_STORAGE_TABLE = "catalystLocalStorage"
    private const val TAG = "SmsConsent"
}

/** Shared SMS runtime permission checks for the receiver and native module. */
object SmsPermissions {
    val SMS_PERMISSIONS = arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)

    fun hasSmsPermission(context: Context): Boolean =
        SMS_PERMISSIONS.all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
}

/**
 * Manifest-declared receiver for android.provider.Telephony.SMS_RECEIVED.
 *
 * The consent gate is enforced here first: when consent is off (or was revoked)
 * nothing is extracted, buffered or forwarded. Only GST/tax keyword-matched
 * messages proceed to the foreground service, which hands them to JS.
 */
class SmsBroadcastReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        if (!SmsConsent.isGranted(context)) {
            Log.i(TAG, "Consent disabled; ignoring incoming SMS")
            return
        }

        if (!SmsPermissions.hasSmsPermission(context)) {
            Log.w(TAG, "SMS permission not granted; ignoring incoming SMS")
            return
        }

        val messages = try {
            Telephony.Sms.Intents.getMessagesFromIntent(intent)
        } catch (error: Exception) {
            Log.w(TAG, "Unable to read SMS from intent: ${error.message}")
            null
        } ?: return

        // Reassemble multipart messages: parts share sender + timestamp.
        data class Part(val sender: String, val timestamp: Long, val body: StringBuilder)

        val grouped = LinkedHashMap<String, Part>()
        for (message in messages) {
            val sender = message.displayOriginatingAddress ?: message.originatingAddress ?: ""
            val body = message.displayMessageBody ?: message.messageBody ?: continue
            val timestamp = message.timestampMillis
            val key = "$sender#$timestamp"
            grouped.getOrPut(key) { Part(sender, timestamp, StringBuilder()) }.body.append(body)
        }

        for (part in grouped.values) {
            val body = part.body.toString()
            if (!GstFilter.isGstRelated(body, part.sender)) {
                Log.d(TAG, "Skipping non-GST SMS from ${part.sender}")
                continue
            }
            forwardToService(context, part.sender, body, part.timestamp)
        }
    }

    private fun forwardToService(context: Context, sender: String, body: String, timestamp: Long) {
        val serviceIntent = Intent(context, SmsForegroundService::class.java).apply {
            action = SmsForegroundService.ACTION_INGEST
            putExtra(SmsForegroundService.EXTRA_SENDER, sender)
            putExtra(SmsForegroundService.EXTRA_BODY, body)
            putExtra(SmsForegroundService.EXTRA_TIMESTAMP, timestamp)
        }
        try {
            ContextCompat.startForegroundService(context, serviceIntent)
        } catch (error: Exception) {
            Log.w(TAG, "Unable to start foreground service: ${error.message}")
        }
    }

    private companion object {
        const val TAG = "SmsBroadcastReceiver"
    }
}
