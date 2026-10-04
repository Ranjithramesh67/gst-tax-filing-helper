package com.gstflow.client.email

import android.content.Context
import android.util.Log
import com.gstflow.client.BuildConfig
import com.gstflow.client.sms.GstFilter
import com.gstflow.client.sms.SmsUploader
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Uploads a single extracted email OTP to `POST /otp/ingest`.
 *
 * Mirrors [SmsUploader]: the JS sync loop only runs while the React app is
 * alive, so native uploads remove that dependency. The auth/token plumbing is
 * deliberately *not* duplicated — it is reused from [SmsUploader] (the module's
 * single source of mirrored credentials and the `66fc7f2` refresh pattern), so
 * there is one credential store and one refresh path.
 *
 * Delivery is idempotent: the server de-duplicates by
 * `(clientId, source, sourceRef)`.
 */
object EmailUploader {
    private const val TAG = "EmailUploader"

    // The brief pins these to 8s so a slow mailbox/backend never wedges the
    // caller longer than the SMS foreground/retry windows.
    private const val CONNECT_TIMEOUT_MS = 8_000
    private const val READ_TIMEOUT_MS = 8_000

    // Server-side field caps (see @gstflow/validation otpIngestItemSchema); bound
    // defensively so an unusually long header cannot get the batch rejected.
    private const val MAX_SUBJECT = 500
    private const val MAX_SNIPPET = 400
    private const val MAX_SOURCE_REF = 200

    fun upload(
        context: Context,
        otp: EmailOtp,
        connectTimeoutMs: Int = CONNECT_TIMEOUT_MS,
        readTimeoutMs: Int = READ_TIMEOUT_MS,
    ): Boolean {
        val base = BuildConfig.API_BASE_URL.trim().trimEnd('/')
        if (base.isEmpty()) return false

        var token = SmsUploader.readAccessToken(context)
        if (token.isNullOrBlank()) {
            Log.i(TAG, "No access token mirrored; JS sync will forward later")
            return false
        }

        var status = postIngest(base, token, context, otp, connectTimeoutMs, readTimeoutMs)
        // The access token is short-lived (15 min). When the app has been closed
        // for longer than that, rotate it with the mirrored refresh token and
        // retry, so background forwarding keeps working without JS.
        if (status == HttpURLConnection.HTTP_UNAUTHORIZED &&
            SmsUploader.refreshAccessToken(context, base, connectTimeoutMs, readTimeoutMs)
        ) {
            token = SmsUploader.readAccessToken(context)
            if (!token.isNullOrBlank()) {
                status = postIngest(base, token, context, otp, connectTimeoutMs, readTimeoutMs)
            }
        }

        return if (status in 200..299) {
            Log.i(TAG, "Forwarded email OTP to backend (HTTP $status)")
            true
        } else {
            Log.w(TAG, "Backend rejected email OTP upload: HTTP $status")
            false
        }
    }

    /** Sends one ingest request and returns the HTTP status, or -1 on failure. */
    private fun postIngest(
        base: String,
        token: String,
        context: Context,
        otp: EmailOtp,
        connectTimeoutMs: Int,
        readTimeoutMs: Int,
    ): Int {
        val deviceId = SmsUploader.readDeviceId(context)
        val item = JSONObject().apply {
            put("code", otp.code)
            put("source", "EMAIL")
            if (otp.fromAddress.isNotEmpty()) put("fromAddress", otp.fromAddress)
            if (otp.subject.isNotEmpty()) put("subject", otp.subject.take(MAX_SUBJECT))
            if (otp.snippet.isNotEmpty()) put("snippet", otp.snippet.take(MAX_SNIPPET))
            put("receivedAt", GstFilter.toIso(otp.receivedAt))
            put("sourceRef", otp.sourceRef.take(MAX_SOURCE_REF))
            if (!deviceId.isNullOrBlank()) put("deviceId", deviceId)
        }
        val payload = JSONObject().put("items", JSONArray().put(item)).toString()

        var connection: HttpURLConnection? = null
        return try {
            connection = (URL("$base/otp/ingest").openConnection() as HttpURLConnection).apply {
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
            Log.w(TAG, "Email OTP upload failed: ${error.message}")
            -1
        } finally {
            connection?.disconnect()
        }
    }
}
