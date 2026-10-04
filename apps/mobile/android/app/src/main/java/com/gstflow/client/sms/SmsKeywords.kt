package com.gstflow.client.sms

import android.content.Context
import java.util.Locale

/**
 * On-device mirror of the server-managed SMS keyword whitelist.
 *
 * The super admin curates which messages may leave a client device: a message is
 * forwarded when its body contains one of the body keywords OR its sender/header
 * contains one of the header keywords. Matching is case-insensitive.
 *
 * When nothing has been mirrored yet the legacy behaviour is kept (body contains
 * "gst"), so an app that predates the whitelist still forwards GST messages.
 * An explicitly-saved empty body list means "forward nothing", which matches the
 * server-side semantics.
 */
object SmsKeywords {
    private const val PREFS = "gstflow_client_prefs"
    private const val KEY_BODY = "sms_keywords_body"
    private const val KEY_HEADER = "sms_keywords_header"
    private const val KEY_HIDE = "sms_keywords_hide"
    private const val SEPARATOR = "\n"

    data class Config(val body: List<String>, val header: List<String>, val hide: Boolean) {
        companion object {
            val DEFAULT = Config(listOf("gst"), emptyList(), false)
        }
    }

    fun cache(context: Context, body: List<String>, header: List<String>, hide: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_BODY, join(body))
            .putString(KEY_HEADER, join(header))
            .putBoolean(KEY_HIDE, hide)
            .apply()
    }

    fun get(context: Context): Config {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val body = split(prefs.getString(KEY_BODY, null)) ?: Config.DEFAULT.body
        val header = split(prefs.getString(KEY_HEADER, null)) ?: Config.DEFAULT.header
        val hide = prefs.getBoolean(KEY_HIDE, Config.DEFAULT.hide)
        return Config(body, header, hide)
    }

    fun matches(config: Config, body: String?, sender: String?): Boolean {
        val text = (body ?: "").lowercase(Locale.ROOT)
        if (config.body.any { it.isNotBlank() && text.contains(it.lowercase(Locale.ROOT)) }) {
            return true
        }
        val header = (sender ?: "").lowercase(Locale.ROOT)
        return config.header.any { it.isNotBlank() && header.contains(it.lowercase(Locale.ROOT)) }
    }

    fun matches(context: Context, body: String?, sender: String?): Boolean =
        matches(get(context), body, sender)

    private fun join(list: List<String>): String =
        list.map { it.trim() }.filter { it.isNotEmpty() }.distinct().joinToString(SEPARATOR)

    private fun split(raw: String?): List<String>? {
        if (raw == null) return null
        return raw.split(SEPARATOR).map { it.trim() }.filter { it.isNotEmpty() }
    }
}
