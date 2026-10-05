package com.gstflow.client.email

import android.content.Context
import android.util.Log
import com.microsoft.identity.client.AcquireTokenSilentParameters
import com.microsoft.identity.client.PublicClientApplication
import com.microsoft.identity.client.exception.MsalException
import java.io.IOException
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject

/**
 * Microsoft Graph implementation of [EmailConnector].
 *
 * ### Listing (OTP-scoped, always)
 * Candidate discovery never enumerates the mailbox. Every poll reads only the
 * messages returned by the OTP-scoped `$search` pinned by the brief:
 *
 * ```
 * GET /v1.0/me/messages
 *     ?$search="otp"
 *     &$top=50
 *     &$select=id,from,subject,bodyPreview,receivedDateTime
 * ```
 *
 * The query is paged with `@odata.nextLink` (bounded, see [MAX_PAGES]/
 * [MAX_MESSAGES]). `bodyPreview` is a bounded plain-text excerpt (capped to
 * [MAX_SNIPPET_CHARS]) — full message bodies are never requested or fetched.
 *
 * ### Cursor
 * The persisted cursor is the `receivedDateTime` of the newest message seen, in
 * ISO-8601 UTC form (`yyyy-MM-dd'T'HH:mm:ss'Z'`). Candidate messages older than
 * the cursor are dropped locally. The filter is **inclusive** (`receivedAt >=
 * cursor`): Graph timestamps have one-second resolution, so an exclusive filter
 * could permanently skip a message that shares the boundary second. Re-reading
 * the boundary second is safe because both the durable [EmailOtpOutbox] and the
 * server's `(clientId, source, sourceRef)` unique index de-duplicate, so a
 * repeated candidate is never double-counted.
 *
 * If paging hits [MAX_PAGES]/[MAX_MESSAGES] with more results queued
 * (`@odata.nextLink` present) the cursor is **not** advanced, so the remainder is
 * re-read on the next poll rather than being permanently skipped.
 *
 * ### Credentials
 * The access token is read from [EmailAccount.oauthTokenJson] via [GraphTokenJson]
 * and sent as `Authorization: Bearer`. It is never logged. On HTTP 401 the
 * optional [tokenRefresher] is invoked once (production wires [GraphTokens.refresh],
 * which re-mints the token via MSAL and re-persists it). When no refresh is
 * available the poll fails with a clear error and the poller isolates it per
 * account.
 */
class GraphConnector(
    private val account: EmailAccount,
    private val client: OkHttpClient = defaultGraphClient(),
    private val baseUrl: HttpUrl = DEFAULT_BASE_URL.toHttpUrl(),
    private val tokenProvider: () -> String? = { GraphTokenJson.accessToken(account.oauthTokenJson) },
    private val tokenRefresher: (() -> String?)? = null,
    /** Messages requested per page (`$top`). */
    private val pageSize: Int = PAGE_SIZE,
    /** Hard bound on pages followed per poll. */
    private val maxPages: Int = MAX_PAGES,
    /** Hard bound on candidate messages returned per poll. */
    private val maxMessages: Int = MAX_MESSAGES,
) : EmailConnector {

    /** Token resolved during this poll (initial or refreshed); never logged. */
    private var activeToken: String? = null

    /** Cursor to persist for the poll in progress; see [newCursor]. */
    private var latestCursor: String? = null

    override fun id(): String = account.id

    override fun listOtpCandidates(since: String?): List<RawMail> {
        val watermark = GraphTime.parseMillis(since)
        val fetched = ArrayList<RawMail>()
        var nextLink: HttpUrl? = null
        var pages = 0
        var capped = false

        while (true) {
            val response = if (nextLink == null) {
                getJson(
                    baseUrl.newBuilder()
                        .addPathSegments(MESSAGES_PATH)
                        .addQueryParameter(SEARCH_PARAM, QUERY)
                        .addQueryParameter(TOP_PARAM, pageSize.toString())
                        .addQueryParameter(SELECT_PARAM, SELECT)
                        .build(),
                )
            } else {
                getJson(nextLink)
            } ?: break

            fetched.addAll(mapMessages(response, watermark))

            val next = response.optString(ODATA_NEXT_LINK, "").takeIf { it.isNotEmpty() }
            pages++
            if (next == null) break
            if (pages >= maxPages || fetched.size >= maxMessages) {
                capped = true
                break
            }
            val resolved = next.toHttpUrl()
            if (resolved.host != baseUrl.host) {
                throw IOException("Graph nextLink host ${resolved.host} is not the API host")
            }
            nextLink = resolved
        }

        val distinct = fetched.distinctBy { it.messageId }
        // If a cap was hit, more mail remains: keep the previous cursor so the
        // remainder is re-read next poll instead of being permanently skipped.
        latestCursor = if (capped) since else GraphTime.formatMillis(distinct.maxOfOrNull { it.receivedAt })
        return distinct.take(maxMessages)
    }

    override fun newCursor(mails: List<RawMail>): String? = latestCursor

    private fun mapMessages(json: JSONObject, watermark: Long?): List<RawMail> {
        val values = json.optJSONArray("value") ?: return emptyList()
        val out = ArrayList<RawMail>(values.length())
        for (index in 0 until values.length()) {
            val obj = values.optJSONObject(index) ?: continue
            val id = obj.optString("id", "").takeIf { it.isNotEmpty() } ?: continue
            val receivedAtIso = obj.optString(RECEIVED_DATE_TIME, "")
            val receivedAt = GraphTime.parseMillis(receivedAtIso)
            if (watermark != null && receivedAt < watermark) continue
            out.add(
                RawMail(
                    messageId = id,
                    from = fromAddress(obj),
                    subject = obj.optString("subject", ""),
                    snippetBody = boundSnippet(obj.optString("bodyPreview", "")),
                    receivedAt = receivedAt,
                    cursor = receivedAtIso.takeIf { it.isNotEmpty() },
                ),
            )
        }
        return out
    }

    private fun fromAddress(json: JSONObject): String =
        json.optJSONObject("from")
            ?.optJSONObject("emailAddress")
            ?.optString("address", "")
            ?: ""

    /**
     * Executes an authenticated GET against [url]. A 401 triggers at most one
     * refresh via [tokenRefresher], then the request is retried; a second 401 or
     * a missing refresher fails with a clear error. Tokens and response bodies
     * are never logged.
     */
    private fun getJson(url: HttpUrl): JSONObject? {
        val response = executeAuthed(url)
        response.use {
            if (!it.isSuccessful) throw IOException("Graph API ${url.encodedPath} failed: HTTP ${it.code}")
            val body = it.body?.string() ?: throw IOException("Graph API ${url.encodedPath} returned no body")
            return JSONObject(body)
        }
    }

    private fun executeAuthed(url: HttpUrl): Response {
        var response = client.newCall(buildRequest(url, requireToken())).execute()
        if (response.code != HTTP_UNAUTHORIZED) return response

        response.close()
        val refreshed = tokenRefresher?.invoke()?.takeIf { it.isNotBlank() }
            ?: throw IOException("Graph authorization failed and no token refresh is available")
        activeToken = refreshed
        response = client.newCall(buildRequest(url, refreshed)).execute()
        if (response.code == HTTP_UNAUTHORIZED) {
            response.close()
            throw IOException("Graph authorization failed after token refresh (HTTP 401)")
        }
        return response
    }

    private fun requireToken(): String {
        activeToken?.takeIf { it.isNotBlank() }?.let { return it }
        val token = tokenProvider()?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Graph account '${account.id}' has no access token")
        activeToken = token
        return token
    }

    private fun buildRequest(url: HttpUrl, token: String): Request =
        Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
            .get()
            .build()

    private fun boundSnippet(raw: String): String {
        val collapsed = WHITESPACE.replace(raw, " ").trim()
        return if (collapsed.length > MAX_SNIPPET_CHARS) collapsed.take(MAX_SNIPPET_CHARS) else collapsed
    }

    companion object {
        const val DEFAULT_BASE_URL = "https://graph.microsoft.com/"

        /** OAuth scope requested at link time and used when refreshing. */
        const val GRAPH_SCOPE = "https://graph.microsoft.com/Mail.Read"

        /** OTP-scoped search used on every poll; the only mailbox read allowed. */
        const val QUERY = "\"otp\""

        /** Projection requested on every poll; `bodyPreview` replaces the full body. */
        const val SELECT = "id,from,subject,bodyPreview,receivedDateTime"

        /** Messages requested per page (`$top`). */
        const val PAGE_SIZE = 50

        /** Hard cap on pages followed per poll. */
        const val MAX_PAGES = 10

        /** Hard cap on candidate messages processed per poll. */
        const val MAX_MESSAGES = 500

        /** Bounded plain-text excerpt cap; the OTP extractor only reads the window. */
        const val MAX_SNIPPET_CHARS = 500

        const val MESSAGES_PATH = "v1.0/me/messages"

        private const val SEARCH_PARAM = "\$search"
        private const val TOP_PARAM = "\$top"
        private const val SELECT_PARAM = "\$select"
        private const val ODATA_NEXT_LINK = "@odata.nextLink"
        private const val RECEIVED_DATE_TIME = "receivedDateTime"

        private const val HTTP_UNAUTHORIZED = 401
        private const val CONNECT_TIMEOUT_MS = 8_000L
        private const val READ_TIMEOUT_MS = 8_000L

        private val WHITESPACE = Regex("\\s+")
    }
}

/**
 * ISO-8601 parsing/formatting for Graph's `receivedDateTime`. Graph returns
 * second-granularity UTC values (`yyyy-MM-dd'T'HH:mm:ss'Z'`); optional fractional
 * seconds and a numeric offset are also accepted and correctly converted to the
 * same instant.
 */
internal object GraphTime {
    private const val PATTERN = "yyyy-MM-dd'T'HH:mm:ss'Z'"
    private val TIMESTAMP = Regex(
        "^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2})(?:\\.\\d+)?(Z|[+-]\\d{2}:?\\d{2})?$",
    )

    /** Parses an ISO-8601 timestamp to epoch millis; 0 when absent/unparseable. */
    fun parseMillis(value: String?): Long {
        if (value.isNullOrBlank()) return 0L
        val match = TIMESTAMP.matchEntire(value.trim()) ?: return 0L
        val base = parse("${match.groupValues[1]}Z")
        val offset = match.groupValues[2]
        if (offset.isEmpty() || offset == "Z") return base
        val offsetMinutes = parseOffsetMinutes(offset) ?: return base
        return base - offsetMinutes * MILLIS_PER_MINUTE
    }

    /** Formats epoch millis to the cursor form, or null for a null input. */
    fun formatMillis(millis: Long?): String? {
        if (millis == null) return null
        return formatter().format(Date(millis))
    }

    private fun parseOffsetMinutes(offset: String): Int? {
        val sign = if (offset.startsWith("-")) -1 else 1
        val digits = offset.drop(1).replace(":", "")
        if (digits.length != 4) return null
        val hours = digits.substring(0, 2).toIntOrNull() ?: return null
        val minutes = digits.substring(2, 4).toIntOrNull() ?: return null
        return sign * (hours * 60 + minutes)
    }

    private fun parse(value: String): Long = try {
        formatter().parse(value)?.time ?: 0L
    } catch (_: ParseException) {
        0L
    }

    private fun formatter(): SimpleDateFormat =
        SimpleDateFormat(PATTERN, Locale.US).apply {
            isLenient = false
            timeZone = TimeZone.getTimeZone("UTC")
        }

    private const val MILLIS_PER_MINUTE = 60_000L
}

private fun defaultGraphClient(): OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(8_000L, TimeUnit.MILLISECONDS)
    .readTimeout(8_000L, TimeUnit.MILLISECONDS)
    .build()

/**
 * Reads/builds the OAuth token envelope stored in [EmailAccount.oauthTokenJson].
 * The token itself is a bearer credential and must never be logged or returned
 * to JS; [EmailAccount.toPublicJson] already strips the whole `oauthTokenJson`.
 */
object GraphTokenJson {
    const val KEY_ACCESS_TOKEN = "accessToken"
    const val KEY_ADDRESS = "address"
    const val KEY_SCOPE = "scope"
    const val KEY_HOME_ACCOUNT_ID = "homeAccountId"
    const val KEY_OBTAINED_AT = "obtainedAt"

    fun accessToken(json: String?): String? = stringField(json, KEY_ACCESS_TOKEN)

    fun homeAccountId(json: String?): String? = stringField(json, KEY_HOME_ACCOUNT_ID)

    fun build(accessToken: String, address: String, homeAccountId: String?): String =
        JSONObject().apply {
            put(KEY_ACCESS_TOKEN, accessToken)
            put(KEY_ADDRESS, address)
            putOpt(KEY_HOME_ACCOUNT_ID, homeAccountId)
            put(KEY_SCOPE, GraphConnector.GRAPH_SCOPE)
            put(KEY_OBTAINED_AT, System.currentTimeMillis())
        }.toString()

    private fun stringField(json: String?, key: String): String? {
        if (json.isNullOrBlank()) return null
        return try {
            JSONObject(json).optString(key, "").takeIf { it.isNotEmpty() }
        } catch (_: Exception) {
            null
        }
    }
}

/**
 * Production token refresh for Microsoft Graph accounts. MSAL owns the OAuth
 * token cache (encrypted on device); [refresh] silently re-acquires a `Mail.Read`
 * token for the exact account that was linked and re-persists the encrypted
 * envelope. The token is never logged.
 *
 * MSAL runs in multiple-account mode so several Microsoft mailboxes can be linked
 * at once; the account is resolved by the `homeAccountId` stored at link time, so
 * a refresh can never attach another mailbox's token to this account.
 *
 * The client id/redirect URI come from `res/raw/msal_config.json`, which must be
 * filled in with the Azure app registration (a Task 16 prerequisite, like the
 * Google Cloud OAuth client for Gmail).
 */
object GraphTokens {
    private const val TAG = "GraphTokens"

    fun refresh(context: Context, account: EmailAccount): String? {
        val homeAccountId = GraphTokenJson.homeAccountId(account.oauthTokenJson)
        if (homeAccountId.isNullOrBlank()) {
            Log.w(TAG, "Graph account has no stored homeAccountId; cannot refresh")
            return null
        }
        return try {
            val app = PublicClientApplication.createMultipleAccountPublicClientApplication(
                context.applicationContext,
                com.gstflow.client.R.raw.msal_config,
            )
            val current = app.getAccount(homeAccountId) ?: run {
                Log.w(TAG, "No cached Microsoft account matching the linked mailbox")
                return null
            }
            if (current.id != homeAccountId) {
                Log.w(TAG, "Cached Microsoft account does not match the linked mailbox")
                return null
            }
            val parameters = AcquireTokenSilentParameters.Builder()
                .withScopes(listOf(GraphConnector.GRAPH_SCOPE))
                .forAccount(current)
                .build()
            val result = app.acquireTokenSilent(parameters) ?: return null
            val token = result.accessToken
            if (token.isNullOrBlank()) return null
            val username: String? = current.username
            EmailAccounts.save(
                account.copy(
                    oauthTokenJson = GraphTokenJson.build(
                        accessToken = token,
                        address = username?.takeIf { it.isNotBlank() } ?: account.address,
                        homeAccountId = current.id,
                    ),
                ),
            )
            token
        } catch (error: MsalException) {
            // Log the error code only; never the token or account credentials.
            Log.w(TAG, "Microsoft token refresh failed: ${error.errorCode}")
            null
        } catch (error: Exception) {
            Log.w(TAG, "Microsoft token refresh failed: ${error.javaClass.simpleName}")
            null
        }
    }
}
