package com.gstflow.client.email

import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.Mockito.mock

/**
 * JVM tests for the poller's account selection, OTP extraction mapping, cursor
 * persistence and upload/retry bookkeeping. Connectors and the sink are fakes:
 * no network and no Android context is touched.
 */
class EmailPollerTest {

    private class FakePrefs : KeyValueStore {
        val values = LinkedHashMap<String, String>()
        override fun getString(key: String): String? = values[key]
        override fun putString(key: String, value: String) {
            values[key] = value
        }
        override fun remove(key: String) {
            values.remove(key)
        }
    }

    private class FakeConnector(
        private val mails: List<RawMail>,
        private val nextCursor: String? = null,
        private val error: Exception? = null,
    ) : EmailConnector {
        val sinceArgs = mutableListOf<String?>()

        override fun id(): String = "fake"

        override fun listOtpCandidates(since: String?): List<RawMail> {
            sinceArgs.add(since)
            error?.let { throw it }
            return mails
        }

        override fun newCursor(mails: List<RawMail>): String? = nextCursor
    }

    private val sink = EmailOtpOutboxStore(FakePrefs())

    private fun account(
        id: String = "acc-1",
        provider: EmailProvider = EmailProvider.IMAP,
        enabled: Boolean = true,
        cursor: String? = "2026-10-01#5",
    ) = EmailAccount(
        id = id,
        provider = provider,
        address = "user@example.com",
        imapHost = "imap.example.com",
        imapPort = 993,
        secretRef = "app-password",
        cursor = cursor,
        enabled = enabled,
    )

    private fun mail(
        messageId: String = "<m1@example.com>",
        body: String = "Your verification code is 4831",
    ) = RawMail(
        messageId = messageId,
        from = "bank@example.com",
        subject = "Your OTP",
        snippetBody = body,
        receivedAt = 1_700_000_000_000L,
        cursor = "9",
    )

    private val context: Context = mock(Context::class.java)

    @Test
    fun connectorForSupportsImapGmailAndGraph() {
        assertTrue(EmailPoller.connectorFor(context, account()) is ImapConnector)
        assertTrue(EmailPoller.connectorFor(context, account(provider = EmailProvider.GMAIL)) is GmailConnector)
        assertTrue(EmailPoller.connectorFor(context, account(provider = EmailProvider.GRAPH)) is GraphConnector)
    }

    @Test
    fun pollsOnlyEnabledSupportedAccounts() {
        val connector = FakeConnector(listOf(mail()), nextCursor = "2026-10-04#9")
        val factoryCalls = mutableListOf<String>()
        val uploaded = mutableListOf<String>()
        val cursors = mutableMapOf<String, String>()
        val statuses = mutableMapOf<String, String?>()

        EmailPoller.pollAll(
            accounts = listOf(
                account("disabled", enabled = false),
                account("gmail", provider = EmailProvider.GMAIL),
                account("imap"),
            ),
            connectorFactory = { a ->
                factoryCalls.add(a.id)
                if (a.provider == EmailProvider.IMAP) connector else null
            },
            sink = sink,
            upload = { item -> uploaded.add(item.accountId); true },
            onCursor = { id, cursor -> cursors[id] = cursor },
            onStatus = { id, _, error -> statuses[id] = error },
            consentGranted = true,
        )

        // Disabled accounts never reach the factory; unsupported providers reach
        // it but yield no connector, so only IMAP is actually read.
        assertFalse("disabled account must not be polled", "disabled" in factoryCalls)
        assertEquals(listOf("gmail", "imap"), factoryCalls)
        assertEquals("only IMAP should hit the network", 1, connector.sinceArgs.size)
        assertEquals("only IMAP mail is uploaded", listOf("imap"), uploaded)
        assertEquals("successful upload drains the outbox", 0, sink.size())
        assertEquals("2026-10-04#9", cursors["imap"])
        assertNull(statuses["imap"])
    }

    @Test
    fun passesTheStoredCursorToTheConnector() {
        val connector = FakeConnector(emptyList())
        val acc = account(cursor = "2026-09-30#42")

        EmailPoller.pollAll(
            listOf(acc), { connector }, sink, { true }, { _, _ -> }, { _, _, _ -> }, true,
        )

        assertEquals(listOf("2026-09-30#42"), connector.sinceArgs)
    }

    @Test
    fun mapsExtractedOtpOntoTheOutboxItem() {
        val connector = FakeConnector(listOf(mail()), nextCursor = "2026-10-04#9")
        val uploaded = mutableListOf<EmailOtp>()

        EmailPoller.pollAll(
            listOf(account()),
            { connector },
            sink,
            { item -> uploaded.add(item); false },
            { _, _ -> },
            { _, _, _ -> },
            true,
        )

        // Upload is made to fail so the mapped item is observable in the outbox.
        val item = uploaded.single()
        assertEquals(1, sink.size())
        assertEquals("4831", item.code)
        assertEquals("bank@example.com", item.fromAddress)
        assertEquals("Your OTP", item.subject)
        assertTrue("snippet must mask the code", item.snippet.contains("••••"))
        assertFalse("snippet must not leak the raw code", item.snippet.contains("4831"))
        assertEquals(1_700_000_000_000L, item.receivedAt)
        assertEquals("<m1@example.com>", item.sourceRef)
        assertEquals("acc-1", item.accountId)
    }

    @Test
    fun skipsMailWithoutAnOtp() {
        val connector = FakeConnector(listOf(mail(body = "Your order shipped today")))

        EmailPoller.pollAll(
            listOf(account()), { connector }, sink, { true }, { _, _ -> }, { _, _, _ -> }, true,
        )

        assertEquals(0, sink.size())
    }

    @Test
    fun uploadFailureKeepsTheItemAndSignalsRetry() {
        val connector = FakeConnector(listOf(mail()), nextCursor = "2026-10-04#9")

        val needsRetry = EmailPoller.pollAll(
            listOf(account()),
            { connector },
            sink,
            { false },
            { _, _ -> },
            { _, _, _ -> },
            true,
        )

        assertTrue(needsRetry)
        assertEquals("failed item must stay queued for the retry job", 1, sink.size())
    }

    @Test
    fun successfulUploadRemovesTheItemFromTheOutbox() {
        val connector = FakeConnector(listOf(mail()), nextCursor = "2026-10-04#9")
        val uploaded = mutableListOf<String>()

        val needsRetry = EmailPoller.pollAll(
            listOf(account()),
            { connector },
            sink,
            { item -> uploaded.add(item.sourceRef); true },
            { _, _ -> },
            { _, _, _ -> },
            true,
        )

        assertFalse(needsRetry)
        assertEquals(listOf("<m1@example.com>"), uploaded)
        assertEquals(0, sink.size())
    }

    @Test
    fun connectorFailureRecordsErrorAndLeavesCursorUnchanged() {
        val connector = FakeConnector(emptyList(), error = IllegalStateException("auth failed"))
        val cursors = mutableListOf<String>()
        val statuses = mutableListOf<Pair<Long?, String?>>()

        val needsRetry = EmailPoller.pollAll(
            listOf(account()),
            { connector },
            sink,
            { true },
            { _, cursor -> cursors.add(cursor) },
            { _, at, error -> statuses.add(at to error) },
            true,
        )

        assertFalse(needsRetry)
        assertTrue("cursor must not advance on a failed poll", cursors.isEmpty())
        assertEquals(1, statuses.size)
        assertEquals("auth failed", statuses.single().second)
    }

    @Test
    fun nullNextCursorLeavesCursorUntouched() {
        val connector = FakeConnector(emptyList(), nextCursor = null)
        val cursors = mutableListOf<String>()

        EmailPoller.pollAll(
            listOf(account()),
            { connector },
            sink,
            { true },
            { _, cursor -> cursors.add(cursor) },
            { _, _, _ -> },
            true,
        )

        assertTrue(cursors.isEmpty())
    }

    @Test
    fun consentOffSkipsEveryAccountAndUploadsNothing() {
        val connector = FakeConnector(listOf(mail()), nextCursor = "2026-10-04#9")
        var factoryCalls = 0
        val uploaded = mutableListOf<String>()

        val needsRetry = EmailPoller.pollAll(
            accounts = listOf(account()),
            connectorFactory = { factoryCalls += 1; connector },
            sink = sink,
            upload = { item -> uploaded.add(item.sourceRef); true },
            onCursor = { _, _ -> },
            onStatus = { _, _, _ -> },
            consentGranted = false,
        )

        assertFalse(needsRetry)
        assertEquals("consent off must not even build a connector", 0, factoryCalls)
        assertTrue("consent off must not upload", uploaded.isEmpty())
        assertEquals("consent off must not queue anything", 0, sink.size())
    }
}
