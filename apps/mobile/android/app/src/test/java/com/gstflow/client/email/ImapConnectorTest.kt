package com.gstflow.client.email

import com.sun.mail.imap.IMAPFolder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import javax.mail.Address
import javax.mail.BodyPart
import javax.mail.Message
import javax.mail.Multipart
import javax.mail.internet.InternetAddress
import javax.mail.search.ComparisonTerm
import javax.mail.search.ReceivedDateTerm
import javax.mail.search.SearchTerm
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.ArgumentCaptor
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito
import org.mockito.Mockito.mock

/**
 * Unit tests for [ImapConnector]'s search/parse/map logic. All IMAP I/O is faked
 * with Mockito mocks of the abstract `javax.mail` types: no network is touched.
 */
class ImapConnectorTest {

    private val account = EmailAccount(
        id = "acc-1",
        provider = EmailProvider.IMAP,
        address = "user@example.com",
        imapHost = "imap.example.com",
        imapPort = 993,
        secretRef = "app-password",
    )
    private val connector = ImapConnector(account)

    @Test
    fun dateCursorDrivesSinceSearch() {
        val folder = imapFolder(message(uid = 1) to 1L)

        connector.collect(folder, "2026-10-01")

        val term = capturedTerm(folder)
        assertEquals(ComparisonTerm.GE, term.comparison)
        assertEquals(parseDate("2026-10-01"), term.date)
    }

    @Test
    fun compositeCursorDrivesSinceSearchAndDropsSeenUids() {
        val seen = message(uid = 10)
        val fresh = message(uid = 15)
        val folder = imapFolder(seen to 10L, fresh to 15L)

        val result = connector.collect(folder, "2026-10-01#10")

        assertEquals(listOf("15"), result.map { it.cursor })
        assertEquals(parseDate("2026-10-01"), capturedTerm(folder).date)
    }

    @Test
    fun nullSinceUsesTwoDayDefaultLookback() {
        val folder = imapFolder()
        val before = System.currentTimeMillis()

        connector.collect(folder, null)

        val after = System.currentTimeMillis()
        val lookbackMs = ImapConnector.DEFAULT_LOOKBACK_DAYS * 86_400_000L
        val term = capturedTerm(folder)
        assertTrue(
            "since ${term.date.time} should be ~now-2d",
            term.date.time in (before - lookbackMs)..(after - lookbackMs),
        )
    }

    @Test
    fun mapsFromSubjectBodyMessageIdAndUid() {
        val received = 1_700_000_000_000L
        val folder = imapFolder(
            message(
                uid = 7,
                from = "alerts@bank.com",
                subject = "Your one-time password",
                body = "Your verification code is 123456",
                messageId = "<abc@bank.com>",
                receivedAt = received,
            ) to 7L,
        )

        val mail = connector.collect(folder, null).single()

        assertEquals("<abc@bank.com>", mail.messageId)
        assertEquals("alerts@bank.com", mail.from)
        assertEquals("Your one-time password", mail.subject)
        assertEquals("Your verification code is 123456", mail.snippetBody)
        assertEquals(received, mail.receivedAt)
        assertEquals("7", mail.cursor)
    }

    @Test
    fun boundsSnippetBodyToTheCap() {
        val folder = imapFolder(message(uid = 1, body = "x".repeat(5_000)) to 1L)

        val mail = connector.collect(folder, null).single()

        assertEquals(ImapConnector.MAX_SNIPPET_CHARS, mail.snippetBody.length)
    }

    @Test
    fun stripsHtmlFromSnippetBody() {
        val folder = imapFolder(
            message(uid = 1, body = "<html><body><p>Your <b>OTP</b> is&nbsp;123456</p></body></html>") to 1L,
        )

        val body = connector.collect(folder, null).single().snippetBody

        assertFalse(body.contains("<"))
        assertEquals("Your OTP is 123456", body)
    }

    @Test
    fun extractsPlainTextFromMultipartBodies() {
        val plain = mock(BodyPart::class.java)
        Mockito.`when`(plain.contentType).thenReturn("text/plain; charset=UTF-8")
        Mockito.`when`(plain.content).thenReturn("Plain body 9999")
        val html = mock(BodyPart::class.java)
        Mockito.`when`(html.contentType).thenReturn("text/html; charset=UTF-8")
        Mockito.`when`(html.content).thenReturn("<b>HTML body</b>")
        val multipart = mock(Multipart::class.java)
        Mockito.`when`(multipart.count).thenReturn(2)
        Mockito.`when`(multipart.getBodyPart(0)).thenReturn(plain)
        Mockito.`when`(multipart.getBodyPart(1)).thenReturn(html)
        val folder = imapFolder(message(uid = 2, body = multipart) to 2L)

        val mail = connector.collect(folder, null).single()

        assertEquals("Plain body 9999", mail.snippetBody)
    }

    @Test
    fun returnsNewestUidFirstAndCapsAtFifty() {
        val entries = (1..55).map { uid ->
            message(uid = uid.toLong(), receivedAt = 1_700_000_000_000L + uid) to uid.toLong()
        }
        val folder = imapFolder(*entries.toTypedArray())

        val result = connector.collect(folder, null)

        assertEquals(ImapConnector.MAX_MESSAGES, result.size)
        assertEquals("55", result.first().cursor)
        assertEquals("6", result.last().cursor)
    }

    @Test
    fun newCursorReturnsMaxUidAndBatchDate() {
        val newest = 1_700_500_000_000L
        val mails = listOf(
            RawMail("m1", "a@b.com", "s", "b", receivedAt = 1_700_000_000_000L, cursor = "5"),
            RawMail("m2", "a@b.com", "s", "b", receivedAt = 1_700_200_000_000L, cursor = "12"),
            RawMail("m3", "a@b.com", "s", "b", receivedAt = newest, cursor = "9"),
        )

        assertEquals("${formatUtc(newest)}#12", connector.newCursor(mails))
    }

    @Test
    fun newCursorIsNullWhenThereIsNothingNew() {
        assertNull(connector.newCursor(emptyList()))
    }

    private fun imapFolder(vararg entries: Pair<Message, Long>): IMAPFolder {
        val folder = mock(IMAPFolder::class.java)
        Mockito.`when`(folder.search(any(SearchTerm::class.java)))
            .thenReturn(entries.map { it.first }.toTypedArray())
        entries.forEach { (message, uid) -> Mockito.`when`(folder.getUID(message)).thenReturn(uid) }
        return folder
    }

    private fun capturedTerm(folder: IMAPFolder): ReceivedDateTerm {
        val captor = ArgumentCaptor.forClass(SearchTerm::class.java)
        Mockito.verify(folder).search(captor.capture())
        return captor.value as ReceivedDateTerm
    }

    private fun message(
        uid: Long,
        from: String = "sender@example.com",
        subject: String = "Your OTP",
        body: Any = "Your code is 1234",
        messageId: String = "<msg-$uid@example.com>",
        receivedAt: Long = 1_700_000_000_000L + uid * 1_000,
    ): Message {
        val message = mock(Message::class.java)
        Mockito.`when`(message.from).thenReturn(arrayOf<Address>(InternetAddress(from)))
        Mockito.`when`(message.subject).thenReturn(subject)
        Mockito.`when`(message.receivedDate).thenReturn(Date(receivedAt))
        Mockito.`when`(message.sentDate).thenReturn(Date(receivedAt))
        Mockito.`when`(message.content).thenReturn(body)
        Mockito.`when`(message.getHeader("Message-ID")).thenReturn(arrayOf(messageId))
        return message
    }

    private fun parseDate(value: String): Date =
        SimpleDateFormat(ImapConnector.DATE_FORMAT, Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .parse(value)!!

    private fun formatUtc(ms: Long): String =
        SimpleDateFormat(ImapConnector.DATE_FORMAT, Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date(ms))
}
