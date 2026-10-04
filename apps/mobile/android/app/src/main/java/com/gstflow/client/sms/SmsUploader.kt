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

        val token = readAccessToken(context)
        if (token.isNullOrBlank()) {
            Log.i(TAG, "No access token mirrored; JS sync will forward later")
            return false
        }

        val deviceId = readDeviceId(context)
        val item = JSONObject().apply {
            put("sender", sms.sender)
            put("body", sms.body)
            put("receivedAt", sms.receivedAtIso)
            put("hash", sms.hash)
            if (!deviceId.isNullOrBlank()) put("deviceId", deviceId)
        }
        val payload = JSONObject().put("items", JSONArray().put(item)).toString()
        val url = URL("$base/sms/ingest")

        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Authorization", "Bearer $token")
        }

        return try {
            connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            stream?.use { it.readBytes() }
            if (status in 200..299) {
                Log.i(TAG, "Forwarded SMS to backend (HTTP $status)")
                true
            } else {
                Log.w(TAG, "Backend rejected SMS upload: HTTP $status")
                false
            }
        } catch (error: Exception) {
            Log.w(TAG, "SMS upload failed: ${error.message}")
            false
        } finally {
            connection.disconnect()
        }
    }

    private fun readAccessToken(context: Context): String? {
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

    private fun readDeviceId(context: Context): String? {
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
