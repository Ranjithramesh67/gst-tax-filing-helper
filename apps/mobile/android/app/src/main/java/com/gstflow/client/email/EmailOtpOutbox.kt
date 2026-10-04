package com.gstflow.client.email

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * One email OTP extracted on-device and awaiting upload to `/otp/ingest`.
 *
 * Only the OTP + a bounded, code-masked excerpt is carried here; the full email
 * body is never retained. [sourceRef] is the provider message id and is the
 * de-dup key both locally (this outbox) and server-side.
 */
data class EmailOtp(
    val code: String,
    val fromAddress: String,
    val subject: String,
    val snippet: String,
    val receivedAt: Long,
    val sourceRef: String,
    val accountId: String,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("code", code)
        put("fromAddress", fromAddress)
        put("subject", subject)
        put("snippet", snippet)
        put("receivedAt", receivedAt)
        put("sourceRef", sourceRef)
        put("accountId", accountId)
    }

    companion object {
        fun fromJson(json: JSONObject): EmailOtp? {
            val sourceRef = json.optString("sourceRef", "")
            if (sourceRef.isEmpty()) return null
            return EmailOtp(
                code = json.optString("code", ""),
                fromAddress = json.optString("fromAddress", ""),
                subject = json.optString("subject", ""),
                snippet = json.optString("snippet", ""),
                receivedAt = json.optLong("receivedAt", 0L),
                sourceRef = sourceRef,
                accountId = json.optString("accountId", ""),
            )
        }
    }
}

/** Minimal sink the poller writes extracted OTPs into (fake-able for tests). */
interface EmailOtpSink {
    fun add(item: EmailOtp)
    fun remove(sourceRefs: Set<String>)
    fun size(): Int
}

/**
 * Durable queue of extracted email OTPs that could not be uploaded immediately
 * (no network, no mirrored token, transient server error). Drained by
 * [EmailRetryJobService] once connectivity returns, even if the app process is
 * killed in the meantime.
 *
 * Pure JVM logic behind [KeyValueStore] so it is unit-testable without Android;
 * production uses plain prefs (see [EmailOtpOutbox]). OTP codes are not mailbox
 * credentials, so plain prefs is acceptable here — credentials live only in
 * [EmailAccounts]' encrypted store.
 *
 * Duplicate delivery is harmless: the server de-duplicates by
 * `(clientId, source, sourceRef)`, and an item is only removed after a 2xx.
 */
class EmailOtpOutboxStore(private val prefs: KeyValueStore) : EmailOtpSink {

    @Synchronized
    override fun add(item: EmailOtp) {
        if (item.sourceRef.isEmpty()) return
        val array = read()
        for (index in 0 until array.length()) {
            if (array.optJSONObject(index)?.optString("sourceRef") == item.sourceRef) return
        }
        array.put(item.toJson())
        while (array.length() > MAX_ITEMS) {
            array.remove(0)
        }
        write(array)
    }

    @Synchronized
    fun all(): List<EmailOtp> {
        val array = read()
        val out = ArrayList<EmailOtp>(array.length())
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            EmailOtp.fromJson(item)?.let { out.add(it) }
        }
        return out
    }

    @Synchronized
    override fun remove(sourceRefs: Set<String>) {
        if (sourceRefs.isEmpty()) return
        val array = read()
        val keep = JSONArray()
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            if (!sourceRefs.contains(item.optString("sourceRef"))) keep.put(item)
        }
        write(keep)
    }

    @Synchronized
    override fun size(): Int = read().length()

    private fun read(): JSONArray {
        val raw = prefs.getString(KEY) ?: return JSONArray()
        if (raw.isEmpty()) return JSONArray()
        return try {
            JSONArray(raw)
        } catch (_: Exception) {
            JSONArray()
        }
    }

    private fun write(array: JSONArray) {
        prefs.putString(KEY, array.toString())
    }

    companion object {
        const val KEY = "pending"
        const val MAX_ITEMS = 500
    }
}

/**
 * Context-backed entry point for the durable email OTP queue. Callers obtain the
 * shared [EmailOtpOutboxStore] once per operation via [store]; a single cached
 * instance is safe because writes are `@Synchronized`.
 */
object EmailOtpOutbox {
    @Volatile
    private var store: EmailOtpOutboxStore? = null

    fun store(context: Context): EmailOtpOutboxStore {
        store?.let { return it }
        return synchronized(this) {
            store ?: EmailOtpOutboxStore(PlainPrefs(context.applicationContext)).also { store = it }
        }
    }

    fun size(context: Context): Int = store(context).size()
}

/** [KeyValueStore] over ordinary [SharedPreferences]; holds OTP codes only. */
private class PlainPrefs(context: Context) : KeyValueStore {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)

    override fun getString(key: String): String? = prefs.getString(key, null)

    override fun putString(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    override fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }

    private companion object {
        const val PREFS_FILE = "gstflow_email_outbox"
    }
}
