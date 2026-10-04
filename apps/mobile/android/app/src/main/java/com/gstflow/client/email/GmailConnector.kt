package com.gstflow.client.email

import android.accounts.Account
import android.content.Context
import android.util.Log
import com.google.android.gms.auth.GoogleAuthUtil
import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject

/**
 * Gmail implementation of [EmailConnector] backed by the Gmail REST API.
 *
 * ### Listing
 * The first poll (no cursor) uses the OTP-scoped search the brief pins:
 *
 * ```
 * GET /gmail/v1/users/me/messages
 *     ?q=(otp OR "verification code" OR "one time password") newer_than:2d
 *     &maxResults=50
 * ```
 *
 * Each candidate id is then expanded with
 * `GET /messages/{id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`
 * and mapped to [RawMail]: `from`/`subject` from the headers, `snippetBody` from
 * the response `snippet` (bounded to [MAX_SNIPPET_CHARS]), `receivedAt` from
 * `internalDate`. The full body is never fetched.
 *
 * ### Cursor
 * The persisted cursor is the mailbox `historyId` (from `users.getProfile`).
 * When a cursor is present the connector takes the incremental
 * `users.history.list?startHistoryId=<cursor>&historyTypes=messageAdded` path and
 * only fetches metadata for the ids it reports; when history has expired
 * (HTTP 404) or no cursor exists yet, it falls back to the query above.
 * [newCursor] returns the `historyId` captured at the start of the poll so the
 * next poll starts exactly after the messages already scanned. Connectors are
 * created per poll, so this short-lived internal state is safe.
 *
 * ### Credentials
 * The access token is read from [EmailAccount.oauthTokenJson] via [GmailTokenJson]
 * and sent as `Authorization: Bearer`. It is never logged. On HTTP 401 the
 * optional [tokenRefresher] is invoked once (production wires
 * [GmailTokens.refresh], which re-mints the token with `GoogleAuthUtil` and
 * re-persists it). When no refresh is available the poll fails with a clear
 * error and the poller isolates it per account.
 */
class GmailConnector(
    private val account: EmailAccount,
    private val client: OkHttpClient = defaultClient(),
    private val baseUrl: HttpUrl = DEFAULT_BASE_URL.toHttpUrl(),
    private val tokenProvider: () -> String? = { GmailTokenJson.accessToken(account.oauthTokenJson) },
    private val tokenRefresher: (() -> String?)? = null,
) : EmailConnector {

    /** Mailbox `historyId` captured at the last [listOtpCandidates] call. */
    private var latestHistoryId: String? = null

    /** Token resolved during this poll (initial or refreshed); never logged. */
    private var activeToken: String? = null

    override fun id(): String = account.id

    override fun listOtpCandidates(since: String?): List<RawMail> {
        val historyId = getProfileHistoryId()
        latestHistoryId = historyId

        val ids = loadCandidateIds(since).distinct().take(MAX_MESSAGES)
        return ids.mapNotNull { id -> fetchRawMail(id) }
    }

    override fun newCursor(mails: List<RawMail>): String? = latestHistoryId

    private fun loadCandidateIds(since: String?): List<String> {
        val startHistoryId = since?.trim()?.toLongOrNull()
        if (startHistoryId == null) return queryMessageIds()

        // Incremental path: only messages added since the last poll. Gmail drops
        // history older than about a week, in which case it returns HTTP 404 and
        // we fall back to the OTP query so no mail is silently skipped.
        val fromHistory = historyMessageIds(startHistoryId)
        return fromHistory ?: queryMessageIds()
    }

    private fun queryMessageIds(): List<String> {
        val json = getJson(MESSAGES_PATH, listOf("q" to QUERY, "maxResults" to MAX_MESSAGES.toString()))
            ?: return emptyList()
        return messageIds(json)
    }

    private fun historyMessageIds(startHistoryId: Long): List<String>? {
        val json = getJson(
            HISTORY_PATH,
            listOf(
                "startHistoryId" to startHistoryId.toString(),
                "historyTypes" to "messageAdded",
                "maxResults" to MAX_HISTORY_RESULTS.toString(),
            ),
            allowNotFound = true,
        ) ?: return null

        val ids = ArrayList<String>()
        val history = json.optJSONArray("history") ?: return ids
        for (index in 0 until history.length()) {
            val messages = history.optJSONObject(index)?.optJSONArray("messages") ?: continue
            for (messageIndex in 0 until messages.length()) {
                messages.optJSONObject(messageIndex)
                    ?.optString("id")
                    ?.takeIf { it.isNotEmpty() }
                    ?.let { ids.add(it) }
            }
        }
        return ids
    }

    private fun messageIds(json: JSONObject): List<String> {
        val array = json.optJSONArray("messages") ?: return emptyList()
        return (0 until array.length()).mapNotNull { index ->
            array.optJSONObject(index)?.optString("id")?.takeIf { it.isNotEmpty() }
        }
    }

    private fun getProfileHistoryId(): String {
        val json = getJson(PROFILE_PATH, emptyList())
            ?: throw IOException("Gmail profile request returned no body")
        return json.optString("historyId", "").takeIf { it.isNotEmpty() }
            ?: throw IOException("Gmail profile response had no historyId")
    }

    private fun fetchRawMail(id: String): RawMail? {
        val json = getJson(
            "$MESSAGES_PATH/$id",
            listOf(
                "format" to "metadata",
                "metadataHeaders" to "From",
                "metadataHeaders" to "Subject",
            ),
            allowNotFound = true,
        ) ?: return null

        return RawMail(
            messageId = json.optString("id", id).ifEmpty { id },
            from = headerValue(json, "From"),
            subject = headerValue(json, "Subject"),
            snippetBody = boundSnippet(json.optString("snippet", "")),
            receivedAt = json.optString("internalDate", "").toLongOrNull() ?: 0L,
            cursor = latestHistoryId,
        )
    }

    private fun headerValue(json: JSONObject, name: String): String {
        val headers = json.optJSONObject("payload")?.optJSONArray("headers") ?: return ""
        for (index in 0 until headers.length()) {
            val header = headers.optJSONObject(index) ?: continue
            if (header.optString("name").equals(name, ignoreCase = true)) {
                return header.optString("value", "")
            }
        }
        return ""
    }

    /**
     * Executes an authenticated GET. A 401 triggers at most one refresh via
     * [tokenRefresher], then the request is retried; a second 401 or a missing
     * refresher fails with a clear error. Returns null only when [allowNotFound]
     * and the server answers 404. Tokens and response bodies are never logged.
     */
    private fun getJson(
        path: String,
        query: List<Pair<String, String>>,
        allowNotFound: Boolean = false,
    ): JSONObject? {
        val response = executeAuthed(path, query)
        response.use {
            if (it.code == HTTP_NOT_FOUND && allowNotFound) return null
            if (!it.isSuccessful) throw IOException("Gmail API $path failed: HTTP ${it.code}")
            val body = it.body?.string() ?: throw IOException("Gmail API $path returned no body")
            return JSONObject(body)
        }
    }

    private fun executeAuthed(path: String, query: List<Pair<String, String>>): Response {
        var response = client.newCall(buildRequest(path, query, requireToken())).execute()
        if (response.code != HTTP_UNAUTHORIZED) return response

        response.close()
        val refreshed = tokenRefresher?.invoke()?.takeIf { it.isNotBlank() }
            ?: throw IOException("Gmail authorization failed and no token refresh is available")
        activeToken = refreshed
        response = client.newCall(buildRequest(path, query, refreshed)).execute()
        if (response.code == HTTP_UNAUTHORIZED) {
            response.close()
            throw IOException("Gmail authorization failed after token refresh (HTTP 401)")
        }
        return response
    }

    private fun requireToken(): String {
        activeToken?.takeIf { it.isNotBlank() }?.let { return it }
        val token = tokenProvider()?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Gmail account '${account.id}' has no access token")
        activeToken = token
        return token
    }

    private fun buildRequest(
        path: String,
        query: List<Pair<String, String>>,
        token: String,
    ): Request {
        val url = baseUrl.newBuilder().addPathSegments(path).apply {
            query.forEach { (name, value) -> addQueryParameter(name, value) }
        }.build()
        return Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
            .get()
            .build()
    }

    private fun boundSnippet(raw: String): String {
        val collapsed = WHITESPACE.replace(raw, " ").trim()
        return if (collapsed.length > MAX_SNIPPET_CHARS) collapsed.take(MAX_SNIPPET_CHARS) else collapsed
    }

    companion object {
        const val DEFAULT_BASE_URL = "https://gmail.googleapis.com/"

        /** OAuth scope requested at link time and used when refreshing the token. */
        const val GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"

        /** OTP-scoped search used on the first poll / when history has expired. */
        const val QUERY = "(otp OR \"verification code\" OR \"one time password\") newer_than:2d"

        const val MAX_MESSAGES = 50

        /** Bounded plain-text excerpt cap; the OTP extractor only reads the window. */
        const val MAX_SNIPPET_CHARS = 500

        private const val PROFILE_PATH = "gmail/v1/users/me/profile"
        private const val MESSAGES_PATH = "gmail/v1/users/me/messages"
        private const val HISTORY_PATH = "gmail/v1/users/me/history"
        private const val MAX_HISTORY_RESULTS = 500

        private const val HTTP_UNAUTHORIZED = 401
        private const val HTTP_NOT_FOUND = 404
        private const val CONNECT_TIMEOUT_MS = 8_000L
        private const val READ_TIMEOUT_MS = 8_000L

        private val WHITESPACE = Regex("\\s+")
    }
}

private fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(8_000L, TimeUnit.MILLISECONDS)
    .readTimeout(8_000L, TimeUnit.MILLISECONDS)
    .build()

/**
 * Reads/builds the OAuth token envelope stored in [EmailAccount.oauthTokenJson].
 * The token itself is a bearer credential and must never be logged or returned
 * to JS; [toPublicJson] already strips the whole `oauthTokenJson` field.
 */
object GmailTokenJson {
    const val KEY_ACCESS_TOKEN = "accessToken"
    const val KEY_ADDRESS = "address"
    const val KEY_SCOPE = "scope"
    const val KEY_OBTAINED_AT = "obtainedAt"

    fun accessToken(json: String?): String? {
        if (json.isNullOrBlank()) return null
        return try {
            JSONObject(json).optString(KEY_ACCESS_TOKEN, "").takeIf { it.isNotEmpty() }
        } catch (_: Exception) {
            null
        }
    }

    fun build(accessToken: String, address: String): String = JSONObject().apply {
        put(KEY_ACCESS_TOKEN, accessToken)
        put(KEY_ADDRESS, address)
        put(KEY_SCOPE, GmailConnector.GMAIL_SCOPE)
        put(KEY_OBTAINED_AT, System.currentTimeMillis())
    }.toString()
}

/**
 * Production token refresh for Gmail accounts. `GoogleSignIn` yields a
 * short-lived access token; [refresh] re-mints it with `GoogleAuthUtil` (no user
 * interaction once consent was granted), re-persists the encrypted envelope and
 * returns the token for the in-flight poll. The token is never logged.
 */
object GmailTokens {
    private const val TAG = "GmailTokens"
    private const val GOOGLE_ACCOUNT_TYPE = "com.google"

    fun refresh(context: Context, account: EmailAccount): String? {
        if (account.address.isBlank()) return null
        return try {
            val token = GoogleAuthUtil.getToken(
                context.applicationContext,
                Account(account.address, GOOGLE_ACCOUNT_TYPE),
                "oauth2:${GmailConnector.GMAIL_SCOPE}",
            )
            if (token.isBlank()) {
                null
            } else {
                EmailAccounts.save(
                    account.copy(oauthTokenJson = GmailTokenJson.build(token, account.address)),
                )
                token
            }
        } catch (error: Exception) {
            // Log only the exception type; never the token or account credentials.
            Log.w(TAG, "Gmail token refresh failed: ${error.javaClass.simpleName}")
            null
        }
    }
}
