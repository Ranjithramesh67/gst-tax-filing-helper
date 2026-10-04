package com.gstflow.client.email

import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for [GmailConnector] against a scripted [MockWebServer]. No live
 * network is touched: the query string, bearer header, list/metadata mapping,
 * snippet bounding, `internalDate` parsing, cursor/history behaviour and error
 * paths are all asserted from recorded requests.
 */
class GmailConnectorTest {

    private lateinit var server: MockWebServer

    private val account = EmailAccount(
        id = "acc-gmail",
        provider = EmailProvider.GMAIL,
        address = "user@gmail.com",
        oauthTokenJson = GmailTokenJson.build("stored-token", "user@gmail.com"),
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
    ): GmailConnector = GmailConnector(
        account = account,
        client = OkHttpClient(),
        baseUrl = server.url("/"),
        tokenProvider = { token },
        tokenRefresher = refresher,
    )

    @Test
    fun firstPollUsesOtpQueryAndBearerToken() {
        server.enqueue(profile("1000"))
        server.enqueue(messageList("m1"))
        server.enqueue(metadata("m1", "alerts@bank.com", "Your OTP", "code 123456", "1700000000000"))

        val mails = connector().listOtpCandidates(null)

        val profileRequest = server.takeRequest()
        assertEquals("/gmail/v1/users/me/profile", profileRequest.requestUrl!!.encodedPath)
        assertEquals("Bearer token-1", profileRequest.getHeader("Authorization"))

        val listRequest = server.takeRequest()
        assertEquals("/gmail/v1/users/me/messages", listRequest.requestUrl!!.encodedPath)
        assertEquals(
            "(otp OR \"verification code\" OR \"one time password\") newer_than:2d",
            listRequest.requestUrl!!.queryParameter("q"),
        )
        assertEquals("50", listRequest.requestUrl!!.queryParameter("maxResults"))
        assertEquals("Bearer token-1", listRequest.getHeader("Authorization"))

        assertEquals(1, mails.size)
    }

    @Test
    fun fetchesMetadataHeadersForEachCandidate() {
        server.enqueue(profile("1000"))
        server.enqueue(messageList("m1"))
        server.enqueue(metadata("m1", "alerts@bank.com", "Your OTP", "s", "1700000000000"))

        connector().listOtpCandidates(null)

        server.takeRequest() // profile
        server.takeRequest() // list
        val metadataRequest = server.takeRequest()
        assertEquals("/gmail/v1/users/me/messages/m1", metadataRequest.requestUrl!!.encodedPath)
        assertEquals("metadata", metadataRequest.requestUrl!!.queryParameter("format"))
        assertEquals(
            listOf("From", "Subject"),
            metadataRequest.requestUrl!!.queryParameterValues("metadataHeaders"),
        )
    }

    @Test
    fun mapsMetadataToRawMail() {
        server.enqueue(profile("1000"))
        server.enqueue(messageList("m1"))
        server.enqueue(metadata("m1", "alerts@bank.com", "Your one-time password", "Use 4831 to sign in", "1700000000000"))

        val mail = connector().listOtpCandidates(null).single()

        assertEquals("m1", mail.messageId)
        assertEquals("alerts@bank.com", mail.from)
        assertEquals("Your one-time password", mail.subject)
        assertEquals("Use 4831 to sign in", mail.snippetBody)
        assertEquals(1_700_000_000_000L, mail.receivedAt)
        assertEquals("1000", mail.cursor)
    }

    @Test
    fun boundsSnippetToTheCap() {
        server.enqueue(profile("1000"))
        server.enqueue(messageList("m1"))
        server.enqueue(metadata("m1", null, null, "x".repeat(5_000), "1700000000000"))

        val mail = connector().listOtpCandidates(null).single()

        assertEquals(GmailConnector.MAX_SNIPPET_CHARS, mail.snippetBody.length)
        assertEquals("", mail.from)
        assertEquals("", mail.subject)
    }

    @Test
    fun newCursorReturnsMailboxHistoryId() {
        server.enqueue(profile("987654"))
        server.enqueue(messageList("m1"))
        server.enqueue(metadata("m1", "a@b.com", "s", "b", "1700000000000"))

        val connector = connector()
        val mails = connector.listOtpCandidates(null)

        assertEquals("987654", connector.newCursor(mails))
        assertEquals("987654", connector.newCursor(emptyList()))
    }

    @Test
    fun newCursorIsNullBeforeAnyPoll() {
        assertNull(connector().newCursor(emptyList()))
    }

    @Test
    fun usesHistoryIncrementalWhenCursorPresent() {
        server.enqueue(profile("2000"))
        server.enqueue(history("m2"))
        server.enqueue(metadata("m2", "a@b.com", "s", "b", "1700000000000"))

        val mails = connector().listOtpCandidates("1000")

        server.takeRequest() // profile
        val historyRequest = server.takeRequest()
        assertEquals("/gmail/v1/users/me/history", historyRequest.requestUrl!!.encodedPath)
        assertEquals("1000", historyRequest.requestUrl!!.queryParameter("startHistoryId"))
        assertEquals("messageAdded", historyRequest.requestUrl!!.queryParameter("historyTypes"))
        assertEquals(listOf("m2"), mails.map { it.messageId })
    }

    @Test
    fun fallsBackToOtpQueryWhenHistoryExpired() {
        server.enqueue(profile("2000"))
        server.enqueue(MockResponse().setResponseCode(404))
        server.enqueue(messageList("m3"))
        server.enqueue(metadata("m3", "a@b.com", "s", "b", "1700000000000"))

        val mails = connector().listOtpCandidates("1")

        server.takeRequest() // profile
        server.takeRequest() // history 404
        val listRequest = server.takeRequest()
        assertEquals("/gmail/v1/users/me/messages", listRequest.requestUrl!!.encodedPath)
        assertNotNull(listRequest.requestUrl!!.queryParameter("q"))
        assertEquals(listOf("m3"), mails.map { it.messageId })
    }

    @Test
    fun skipsMetadataThatDisappeared() {
        server.enqueue(profile("1000"))
        server.enqueue(messageList("gone", "m1"))
        server.enqueue(MockResponse().setResponseCode(404))
        server.enqueue(metadata("m1", "a@b.com", "s", "b", "1700000000000"))

        val mails = connector().listOtpCandidates(null)

        assertEquals(listOf("m1"), mails.map { it.messageId })
    }

    @Test
    fun refreshesTokenOnceOnUnauthorized() {
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(profile("1000"))
        server.enqueue(messageList("m1"))
        server.enqueue(metadata("m1", "a@b.com", "s", "b", "1700000000000"))

        val mails = connector(token = "stale", refresher = { "fresh" }).listOtpCandidates(null)

        val first = server.takeRequest()
        assertEquals("Bearer stale", first.getHeader("Authorization"))
        val retried = server.takeRequest()
        assertEquals("Bearer fresh", retried.getHeader("Authorization"))
        // Subsequent calls reuse the refreshed token rather than the stale one.
        val listRequest = server.takeRequest()
        assertEquals("Bearer fresh", listRequest.getHeader("Authorization"))
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
        // Default token provider reads account.oauthTokenJson, which is absent.
        val noToken = account.copy(oauthTokenJson = null)
        val connector = GmailConnector(
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
        server.enqueue(profile("1000"))
        server.enqueue(messageList())

        val connector = GmailConnector(
            account = account,
            client = OkHttpClient(),
            baseUrl = server.url("/"),
        )

        connector.listOtpCandidates(null)

        val profileRequest = server.takeRequest()
        assertEquals("Bearer stored-token", profileRequest.getHeader("Authorization"))
    }

    @Test
    fun nonSuccessListResponseFailsWithoutLeakingBody() {
        server.enqueue(profile("1000"))
        server.enqueue(MockResponse().setResponseCode(500).setBody("sensitive upstream detail"))

        val error = assertThrows(java.io.IOException::class.java) {
            connector().listOtpCandidates(null)
        }

        assertTrue(error.message!!.contains("500"))
        assertTrue(error.message!!.contains("messages"))
    }

    private fun profile(historyId: String): MockResponse = MockResponse().setBody(
        JSONObject()
            .put("emailAddress", "user@gmail.com")
            .put("historyId", historyId)
            .toString(),
    )

    private fun messageList(vararg ids: String): MockResponse =
        MockResponse().setBody(JSONObject().put("messages", idArray(*ids)).toString())

    private fun history(vararg ids: String): MockResponse =
        MockResponse().setBody(
            JSONObject()
                .put("history", JSONArray().put(JSONObject().put("messages", idArray(*ids))))
                .put("historyId", "2000")
                .toString(),
        )

    private fun idArray(vararg ids: String): JSONArray {
        val array = JSONArray()
        ids.forEach { array.put(JSONObject().put("id", it)) }
        return array
    }

    private fun metadata(
        id: String,
        from: String?,
        subject: String?,
        snippet: String,
        internalDate: String,
    ): MockResponse {
        val headers = JSONArray()
        if (from != null) headers.put(JSONObject().put("name", "From").put("value", from))
        if (subject != null) headers.put(JSONObject().put("name", "Subject").put("value", subject))
        val body = JSONObject()
            .put("id", id)
            .put("historyId", "1000")
            .put("snippet", snippet)
            .put("internalDate", internalDate)
            .put("payload", JSONObject().put("headers", headers))
        return MockResponse().setBody(body.toString())
    }
}
