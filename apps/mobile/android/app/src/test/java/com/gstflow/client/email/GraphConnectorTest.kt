package com.gstflow.client.email

import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for [GraphConnector] against a scripted [MockWebServer]. No live
 * network is touched: the OTP `$search`/`$select` query, bearer header, message
 * mapping, `bodyPreview` bounding, `receivedDateTime` parsing, cursor/watermark
 * behaviour and error paths are all asserted from recorded requests.
 */
class GraphConnectorTest {

    private lateinit var server: MockWebServer

    private val account = EmailAccount(
        id = "acc-graph",
        provider = EmailProvider.GRAPH,
        address = "user@contoso.com",
        oauthTokenJson = GraphTokenJson.build("stored-token", "user@contoso.com", "home-1"),
    )

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun connector(
        token: String? = "token-1",
        refresher: (() -> String?)? = null,
        maxPages: Int = GraphConnector.MAX_PAGES,
    ): GraphConnector = GraphConnector(
        account = account,
        client = OkHttpClient(),
        baseUrl = server.url("/"),
        tokenProvider = { token },
        tokenRefresher = refresher,
        maxPages = maxPages,
    )

    @Test
    fun firstPollUsesOtpSearchSelectAndBearerToken() {
        server.enqueue(page(null, message("m1", "alerts@bank.com", "Your OTP", "code 123456", T1)))

        val mails = connector().listOtpCandidates(null)

        val request = server.takeRequest()
        assertEquals("/v1.0/me/messages", request.requestUrl!!.encodedPath)
        assertEquals("\"otp\"", request.requestUrl!!.queryParameter("\$search"))
        assertEquals("50", request.requestUrl!!.queryParameter("\$top"))
        assertEquals(
            "id,from,subject,bodyPreview,receivedDateTime",
            request.requestUrl!!.queryParameter("\$select"),
        )
        assertEquals("Bearer token-1", request.getHeader("Authorization"))
        assertEquals(1, mails.size)
    }

    @Test
    fun mapsMessageToRawMail() {
        server.enqueue(page(null, message("m1", "alerts@bank.com", "Your one-time password", "Use 4831 to sign in", T1)))

        val mail = connector().listOtpCandidates(null).single()

        assertEquals("m1", mail.messageId)
        assertEquals("alerts@bank.com", mail.from)
        assertEquals("Your one-time password", mail.subject)
        assertEquals("Use 4831 to sign in", mail.snippetBody)
        assertEquals(1_700_000_000_000L, mail.receivedAt)
        assertEquals(T1, mail.cursor)
    }

    @Test
    fun boundsSnippetToTheCapAndToleratesMissingFrom() {
        server.enqueue(page(null, message("m1", null, null, "x".repeat(5_000), T1)))

        val mail = connector().listOtpCandidates(null).single()

        assertEquals(GraphConnector.MAX_SNIPPET_CHARS, mail.snippetBody.length)
        assertEquals("", mail.from)
        assertEquals("", mail.subject)
    }

    @Test
    fun newCursorReturnsLatestReceivedDateTime() {
        server.enqueue(
            page(
                null,
                message("m1", "a@b.com", "s", "b", "2023-11-14T22:13:10Z"),
                message("m2", "c@d.com", "s2", "b2", T1),
            ),
        )

        val connector = connector()
        val mails = connector.listOtpCandidates(null)

        assertEquals(T1, connector.newCursor(mails))
        // The cursor survives an empty argument (it is connector state).
        assertEquals(T1, connector.newCursor(emptyList()))
    }

    @Test
    fun newCursorIsNullBeforeAnyPoll() {
        assertNull(connector().newCursor(emptyList()))
    }

    @Test
    fun dropsMessagesOlderThanTheCursor() {
        val watermark = GraphTime.formatMillis(1_699_999_995_000L)
        server.enqueue(
            page(
                null,
                message("old", "a@b.com", "s", "b", "2023-11-14T22:13:10Z"),
                message("new", "c@d.com", "s2", "b2", T1),
            ),
        )

        val mails = connector().listOtpCandidates(watermark)

        assertEquals(listOf("new"), mails.map { it.messageId })
    }

    @Test
    fun keepsMessagesSharingTheCursorSecond() {
        // Cursor is inclusive: a message stamped at the exact cursor second is
        // re-read rather than skipped (safe because ingest is idempotent).
        val watermark = GraphTime.formatMillis(1_700_000_000_000L)
        server.enqueue(page(null, message("m1", "a@b.com", "s", "b", T1)))

        val mails = connector().listOtpCandidates(watermark)

        assertEquals(listOf("m1"), mails.map { it.messageId })
    }

    @Test
    fun followsOdataNextLink() {
        val next = server.url("/next?page=2").toString()
        server.enqueue(page(next, message("m1", "a@b.com", "s", "b", "2023-11-14T22:13:10Z")))
        server.enqueue(page(null, message("m2", "c@d.com", "s2", "b2", T1)))

        val connector = connector()
        val mails = connector.listOtpCandidates(null)

        server.takeRequest() // first page
        val second = server.takeRequest()
        assertEquals("/next", second.requestUrl!!.encodedPath)
        assertEquals("page=2", second.requestUrl!!.query)
        assertEquals(listOf("m1", "m2"), mails.map { it.messageId })
        assertEquals(T1, connector.newCursor(mails))
    }

    @Test
    fun doesNotAdvanceCursorWhenPageCapHit() {
        val since = "2023-11-14T22:13:00Z"
        server.enqueue(page(server.url("/next").toString(), message("m1", "a@b.com", "s", "b", "2023-11-14T22:13:10Z")))

        val connector = connector(maxPages = 1)
        val mails = connector.listOtpCandidates(since)

        assertEquals(listOf("m1"), mails.map { it.messageId })
        // Cap hit with more queued: the cursor must stay at the stored value so
        // the remainder is re-read next poll rather than skipped.
        assertEquals(since, connector.newCursor(mails))
    }

    @Test
    fun refreshesTokenOnceOnUnauthorized() {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(page(null, message("m1", "a@b.com", "s", "b", T1)))

        val mails = connector(token = "stale", refresher = { "fresh" }).listOtpCandidates(null)

        val first = server.takeRequest()
        assertEquals("Bearer stale", first.getHeader("Authorization"))
        val retried = server.takeRequest()
        assertEquals("Bearer fresh", retried.getHeader("Authorization"))
        assertEquals(1, mails.size)
    }

    @Test
    fun failsOnUnauthorizedWithoutRefresher() {
        server.enqueue(MockResponse().setResponseCode(401))

        assertThrows(java.io.IOException::class.java) {
            connector(token = "stale").listOtpCandidates(null)
        }
    }

    @Test
    fun throwsWhenNoAccessToken() {
        val noToken = account.copy(oauthTokenJson = null)
        val connector = GraphConnector(
            account = noToken,
            client = OkHttpClient(),
            baseUrl = server.url("/"),
        )

        assertThrows(IllegalStateException::class.java) {
            connector.listOtpCandidates(null)
        }
        assertEquals(0, server.requestCount)
    }

    @Test
    fun readsStoredTokenEnvelope() {
        server.enqueue(page(null))

        GraphConnector(
            account = account,
            client = OkHttpClient(),
            baseUrl = server.url("/"),
        ).listOtpCandidates(null)

        assertEquals("Bearer stored-token", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun nonSuccessFailsWithoutLeakingBody() {
        server.enqueue(MockResponse().setResponseCode(500).setBody("sensitive upstream detail"))

        val error = assertThrows(java.io.IOException::class.java) {
            connector().listOtpCandidates(null)
        }

        assertTrue(error.message!!.contains("500"))
        assertTrue(error.message!!.contains("messages"))
    }

    @Test
    fun rejectsNextLinkToForeignHost() {
        server.enqueue(page("https://evil.example/next", message("m1", "a@b.com", "s", "b", T1)))

        assertThrows(java.io.IOException::class.java) {
            connector().listOtpCandidates(null)
        }
    }

    @Test
    fun capWithNoCursorLeavesCursorNull() {
        server.enqueue(page(server.url("/next").toString(), message("m1", "a@b.com", "s", "b", T1)))

        val connector = connector(maxPages = 1)
        val mails = connector.listOtpCandidates(null)

        assertEquals(listOf("m1"), mails.map { it.messageId })
        assertNull(connector.newCursor(mails))
    }

    @Test
    fun parsesFractionalSecondsAndOffsetsToTheSameInstant() {
        assertEquals(1_700_000_000_000L, GraphTime.parseMillis("2023-11-14T22:13:20.250Z"))
        // 22:13:20+05:30 is the same instant as 16:43:20Z.
        assertEquals(1_699_980_200_000L, GraphTime.parseMillis("2023-11-14T22:13:20+05:30"))
        assertEquals(0L, GraphTime.parseMillis(null))
    }

    private fun message(id: String, address: String?, subject: String?, preview: String, received: String): JSONObject {
        val obj = JSONObject()
            .put("id", id)
            .put("subject", subject ?: "")
            .put("bodyPreview", preview)
            .put("receivedDateTime", received)
        if (address != null) {
            obj.put("from", JSONObject().put("emailAddress", JSONObject().put("address", address)))
        }
        return obj
    }

    private fun page(nextLink: String?, vararg messages: JSONObject): MockResponse {
        val body = JSONObject().put("value", JSONArray().apply { messages.forEach { put(it) } })
        if (nextLink != null) body.put("@odata.nextLink", nextLink)
        return MockResponse().setBody(body.toString())
    }

    private companion object {
        const val T1 = "2023-11-14T22:13:20Z"
    }
}
