package com.gstflow.client.email

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject

/** Provider backing an email account. Serialized by name to wire/JS. */
enum class EmailProvider {
    IMAP,
    GMAIL,
    GRAPH;

    companion object {
        fun fromWire(value: String?): EmailProvider? =
            values().firstOrNull { it.name.equals(value, ignoreCase = true) }
    }
}

/**
 * A linked mailbox. [oauthTokenJson] (and anything referenced by [secretRef]) is
 * persisted by [EmailAccounts] inside [EncryptedSharedPreferences], never plain
 * prefs. [cursor] and [lastPolledAt]/[lastError] are poll bookkeeping.
 */
data class EmailAccount(
    val id: String,
    val provider: EmailProvider,
    val address: String,
    val imapHost: String? = null,
    val imapPort: Int? = null,
    val secretRef: String? = null,
    val oauthTokenJson: String? = null,
    val cursor: String? = null,
    val enabled: Boolean = true,
    val lastPolledAt: Long? = null,
    val lastError: String? = null,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("provider", provider.name)
        put("address", address)
        putOpt("imapHost", imapHost)
        putOpt("imapPort", imapPort)
        putOpt("secretRef", secretRef)
        putOpt("oauthTokenJson", oauthTokenJson)
        putOpt("cursor", cursor)
        put("enabled", enabled)
        putOpt("lastPolledAt", lastPolledAt)
        putOpt("lastError", lastError)
    }

    companion object {
        fun fromJson(json: JSONObject): EmailAccount? {
            val id = json.optString("id", "")
            if (id.isEmpty()) return null
            val provider = EmailProvider.fromWire(json.optStringOrNull("provider")) ?: return null
            return EmailAccount(
                id = id,
                provider = provider,
                address = json.optString("address", ""),
                imapHost = json.optStringOrNull("imapHost"),
                imapPort = json.optIntOrNull("imapPort"),
                secretRef = json.optStringOrNull("secretRef"),
                oauthTokenJson = json.optStringOrNull("oauthTokenJson"),
                cursor = json.optStringOrNull("cursor"),
                enabled = if (json.has("enabled")) json.optBoolean("enabled") else true,
                lastPolledAt = json.optLongOrNull("lastPolledAt"),
                lastError = json.optStringOrNull("lastError"),
            )
        }
    }
}

private fun JSONObject.optStringOrNull(key: String): String? =
    if (has(key) && !isNull(key)) optString(key) else null

private fun JSONObject.optIntOrNull(key: String): Int? =
    if (has(key) && !isNull(key)) optInt(key) else null

private fun JSONObject.optLongOrNull(key: String): Long? =
    if (has(key) && !isNull(key)) optLong(key) else null

/** Key-value sink used by [EmailAccountStore]; the real store backs it with encrypted prefs. */
interface KeyValueStore {
    fun getString(key: String): String?
    fun putString(key: String, value: String)
    fun remove(key: String)
}

/**
 * Serialization/index logic for the account registry. Pure JVM and constructor
 * injected so it can be unit-tested without Android or Robolectric.
 */
class EmailAccountStore(private val prefs: KeyValueStore) {
    @Synchronized
    fun save(account: EmailAccount) {
        val accounts = readAccounts().toMutableList()
        val index = accounts.indexOfFirst { it.id == account.id }
        if (index >= 0) accounts[index] = account else accounts.add(account)
        writeAccounts(accounts)
    }

    @Synchronized
    fun get(id: String): EmailAccount? = readAccounts().firstOrNull { it.id == id }

    @Synchronized
    fun list(): List<EmailAccount> = readAccounts()

    @Synchronized
    fun remove(id: String) {
        writeAccounts(readAccounts().filterNot { it.id == id })
    }

    @Synchronized
    fun setCursor(id: String, cursor: String?) = update(id) { it.copy(cursor = cursor) }

    @Synchronized
    fun markStatus(id: String, lastPolledAt: Long?, error: String?) =
        update(id) { it.copy(lastPolledAt = lastPolledAt, lastError = error) }

    private fun update(id: String, transform: (EmailAccount) -> EmailAccount) {
        val accounts = readAccounts().toMutableList()
        val index = accounts.indexOfFirst { it.id == id }
        if (index < 0) return
        accounts[index] = transform(accounts[index])
        writeAccounts(accounts)
    }

    private fun readAccounts(): List<EmailAccount> {
        val raw = prefs.getString(KEY_ACCOUNTS) ?: return emptyList()
        return try {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { index ->
                array.optJSONObject(index)?.let { EmailAccount.fromJson(it) }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun writeAccounts(accounts: List<EmailAccount>) {
        val array = JSONArray()
        for (account in accounts) array.put(account.toJson())
        prefs.putString(KEY_ACCOUNTS, array.toString())
    }

    companion object {
        const val KEY_ACCOUNTS = "accounts"
    }
}

/**
 * Registry of linked email accounts. Call [init] once from the application (or a
 * service) before use; all reads/writes go through [EncryptedSharedPreferences]
 * so credentials are never serialized to plain prefs.
 */
object EmailAccounts {
    private const val PREFS_FILE = "gstflow_email_accounts"

    @Volatile
    private var store: EmailAccountStore? = null

    fun init(context: Context) {
        val app = context.applicationContext
        store = EmailAccountStore(EncryptedPrefs(app, PREFS_FILE))
    }

    private fun requireStore(): EmailAccountStore =
        store ?: throw IllegalStateException("EmailAccounts.init(context) has not been called")

    fun save(account: EmailAccount) = requireStore().save(account)

    fun get(id: String): EmailAccount? = requireStore().get(id)

    fun list(): List<EmailAccount> = requireStore().list()

    fun remove(id: String) = requireStore().remove(id)

    fun setCursor(id: String, cursor: String?) = requireStore().setCursor(id, cursor)

    fun markStatus(id: String, lastPolledAt: Long?, error: String? = null) =
        requireStore().markStatus(id, lastPolledAt, error)
}

/** [KeyValueStore] backed by AES256_GCM/SIV [EncryptedSharedPreferences]. */
private class EncryptedPrefs(context: Context, fileName: String) : KeyValueStore {
    private val prefs: SharedPreferences = create(context, fileName)

    override fun getString(key: String): String? = prefs.getString(key, null)

    override fun putString(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    override fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }

    private companion object {
        fun create(context: Context, fileName: String): SharedPreferences {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            return EncryptedSharedPreferences.create(
                context,
                fileName,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        }
    }
}
