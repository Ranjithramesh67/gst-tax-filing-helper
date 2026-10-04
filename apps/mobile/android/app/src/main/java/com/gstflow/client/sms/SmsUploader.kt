package com.gstflow.client.sms

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import com.gstflow.client.BuildConfig
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Uploads a single captured GST SMS straight to the backend from native code.
 *
 * The JS sync loop only runs while the React app is alive, so a message
 * received while the app is closed used to sit unforwarded until the user
 * reopened the app. Uploading from the foreground service removes that
 * dependency: the OTP/return/notice reaches the backend as soon as it arrives.
 *
 * Delivery is idempotent: the server de-duplicates by (clientId, hash), so the
 * same message may safely be uploaded again later by the JS queue.
 */
object SmsUploader {
    private const val TAG = "SmsUploader"

    // Shared with SmsConsent; JS mirrors trust material here via
    // SmsReaderModule.setSyncCredentials so no AsyncStorage read is required.
    private const val PREFS = "gstflow_client_prefs"
    private const val PREF_ACCESS_TOKEN = "access_token"
    private const val PREF_REFRESH_TOKEN = "refresh_token"
    private const val PREF_DEVICE_ID = "device_id"

    private const val AUTH_KEY = "gstflow.mobile.auth"
    private const val DEVICE_ID_KEY = "gstflow.mobile.deviceId"

    fun upload(
        context: Context,
        sms: IncomingSms,
        connectTimeoutMs: Int = CONNECT_TIMEOUT_MS,
        readTimeoutMs: Int = READ_TIMEOUT_MS,
    ): Boolean {
        val base = BuildConfig.API_BASE_URL.trim().trimEnd('/')
        if (base.isEmpty()) return false

        var token = readAccessToken(context)
        if (token.isNullOrBlank()) {
            Log.i(TAG, "No access token mirrored; JS sync will forward later")
            return false
        }

        var status = postIngest(base, token, context, sms, connectTimeoutMs, readTimeoutMs)
        // The access token is short-lived (15 min). When the app has been closed
        // for longer than that, rotate it with the mirrored refresh token and
        // retry, so background forwarding keeps working without JS.
        if (status == HttpURLConnection.HTTP_UNAUTHORIZED && refreshAccessToken(context, base, connectTimeoutMs, readTimeoutMs)) {
            token = readAccessToken(context)
            if (!token.isNullOrBlank()) {
                status = postIngest(base, token, context, sms, connectTimeoutMs, readTimeoutMs)
            }
        }

        return if (status in 200..299) {
            Log.i(TAG, "Forwarded SMS to backend (HTTP $status)")
            true
        } else {
            Log.w(TAG, "Backend rejected SMS upload: HTTP $status")
            false
        }
    }

    /** Sends one ingest request and returns the HTTP status, or -1 on failure. */
    private fun postIngest(
        base: String,
        token: String,
        context: Context,
        sms: IncomingSms,
        connectTimeoutMs: Int,
        readTimeoutMs: Int,
    ): Int {
        val deviceId = readDeviceId(context)
        val item = JSONObject().apply {
            put("sender", sms.sender)
            put("body", sms.body)
            put("receivedAt", sms.receivedAtIso)
            put("hash", sms.hash)
            if (!deviceId.isNullOrBlank()) put("deviceId", deviceId)
        }
        val payload = JSONObject().put("items", JSONArray().put(item)).toString()

        var connection: HttpURLConnection? = null
        return try {
            connection = (URL("$base/sms/ingest").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                this.connectTimeout = connectTimeoutMs
                this.readTimeout = readTimeoutMs
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Authorization", "Bearer $token")
            }
            connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            stream?.use { it.readBytes() }
            status
        } catch (error: Exception) {
            Log.w(TAG, "SMS upload failed: ${error.message}")
            -1
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * Exchanges the mirrored refresh token for a fresh access/refresh pair and
     * persists them for subsequent uploads. Returns true when the access token
     * was refreshed. All failures are non-fatal: the outbox retry job will try
     * again later.
     */
    internal fun refreshAccessToken(
        context: Context,
        base: String,
        connectTimeoutMs: Int,
        readTimeoutMs: Int,
    ): Boolean {
        val refreshToken = readRefreshToken(context)
        if (refreshToken.isNullOrBlank()) {
            Log.i(TAG, "No refresh token mirrored; cannot rotate access token")
            return false
        }

        var connection: HttpURLConnection? = null
        return try {
            val body = JSONObject().put("refreshToken", refreshToken).toString()
            connection = (URL("$base/auth/refresh").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                this.connectTimeout = connectTimeoutMs
                this.readTimeout = readTimeoutMs
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
            }
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            if (status !in 200..299) {
                Log.w(TAG, "Token refresh rejected: HTTP $status")
                return false
            }
            val text = connection.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
            val json = JSONObject(text)
            val access = json.optString("accessToken")
            val rotated = json.optString("refreshToken")
            if (access.isBlank()) return false
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
                putString(PREF_ACCESS_TOKEN, access)
                if (rotated.isNotBlank()) putString(PREF_REFRESH_TOKEN, rotated)
            }.apply()
            Log.i(TAG, "Rotated access token natively")
            true
        } catch (error: Exception) {
            Log.w(TAG, "Token refresh failed: ${error.message}")
            false
        } finally {
            connection?.disconnect()
        }
    }

    internal fun readAccessToken(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val mirrored = prefs.getString(PREF_ACCESS_TOKEN, null)
        if (!mirrored.isNullOrBlank()) return mirrored

        // Fall back to a direct AsyncStorage read for installs that logged in
        // before credential mirroring existed.
        val raw = readStorageValue(context, AUTH_KEY) ?: return null
        return try {
            JSONObject(raw).optString("accessToken").ifBlank { null }
        } catch (_: Exception) {
            null
        }
    }

    private fun readRefreshToken(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val mirrored = prefs.getString(PREF_REFRESH_TOKEN, null)
        if (!mirrored.isNullOrBlank()) return mirrored

        // Fall back to a direct AsyncStorage read for installs whose token was
        // persisted by the JS layer before mirroring was wired up.
        val raw = readStorageValue(context, AUTH_KEY) ?: return null
        return try {
            JSONObject(raw).optString("refreshToken").ifBlank { null }
        } catch (_: Exception) {
            null
        }
    }

    internal fun readDeviceId(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val mirrored = prefs.getString(PREF_DEVICE_ID, null)
        if (!mirrored.isNullOrBlank()) return mirrored
        return readStorageValue(context, DEVICE_ID_KEY)
    }

    /**
     * Reads a value from AsyncStorage on disk, supporting both the legacy
     * (RKStorage/catalystLocalStorage) and the current (AsyncStorage/Storage)
     * stores used across AsyncStorage versions.
     */
    private fun readStorageValue(context: Context, key: String): String? {
        val stores = listOf(
            "AsyncStorage" to "Storage",
            "RKStorage" to "catalystLocalStorage",
        )
        for ((dbName, table) in stores) {
            val dbFile = context.getDatabasePath(dbName)
            if (!dbFile.exists()) continue
            try {
                SQLiteDatabase.openDatabase(dbFile.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                    db.query(table, arrayOf("value"), "key = ?", arrayOf(key), null, null, null).use { cursor ->
                        if (cursor.moveToFirst()) {
                            val value = cursor.getString(0)
                            if (value != null) return value
                        }
                    }
                }
            } catch (error: Exception) {
                Log.w(TAG, "Unable to read $key from $dbName: ${error.message}")
            }
        }
        return null
    }

    private const val CONNECT_TIMEOUT_MS = 15_000
    private const val READ_TIMEOUT_MS = 20_000
}
