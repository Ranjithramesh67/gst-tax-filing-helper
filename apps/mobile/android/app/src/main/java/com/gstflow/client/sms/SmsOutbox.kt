package com.gstflow.client.sms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Durable queue of matched SMS that could not be uploaded immediately (no
 * network, no mirrored token, transient server error). Drained by
 * [SmsRetryJobService] once connectivity returns, even if the app process is
 * killed in the meantime.
 *
 * Duplicate delivery is harmless: the server de-duplicates by (clientId, hash),
 * so an item is only removed from the outbox after a 2xx upload.
 */
object SmsOutbox {
    private const val PREFS = "gstflow_sms_outbox"
    private const val KEY = "pending"
    private const val MAX_ITEMS = 500

    @Synchronized
    fun add(context: Context, sms: IncomingSms) {
        val array = read(context)
        for (index in 0 until array.length()) {
            if (array.optJSONObject(index)?.optString("hash") == sms.hash) return
        }
        array.put(
            JSONObject().apply {
                put("sender", sms.sender)
                put("body", sms.body)
                put("receivedAt", sms.receivedAtMillis)
                put("hash", sms.hash)
            },
        )
        while (array.length() > MAX_ITEMS) {
            array.remove(0)
        }
        write(context, array)
    }

    @Synchronized
    fun all(context: Context): List<IncomingSms> {
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
        return out
    }

    @Synchronized
    fun remove(context: Context, hashes: Set<String>) {
        if (hashes.isEmpty()) return
        val array = read(context)
        val keep = JSONArray()
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            if (!hashes.contains(item.optString("hash"))) keep.put(item)
        }
        write(context, keep)
    }

    @Synchronized
    fun size(context: Context): Int = read(context).length()

    private fun read(context: Context): JSONArray {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
        if (raw.isNullOrEmpty()) return JSONArray()
        return try {
            JSONArray(raw)
        } catch (_: Exception) {
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
