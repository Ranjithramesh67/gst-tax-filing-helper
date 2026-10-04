package com.gstflow.client.email

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.Properties
import java.util.TimeZone
import javax.mail.BodyPart
import javax.mail.Folder
import javax.mail.Message
import javax.mail.Multipart
import javax.mail.Session
import javax.mail.UIDFolder
import javax.mail.internet.InternetAddress
import javax.mail.search.ComparisonTerm
import javax.mail.search.ReceivedDateTerm

/**
 * IMAP implementation of [EmailConnector].
 *
 * Connects over SSL (`imaps`, default port 993), opens `INBOX` READ-ONLY, and
 * searches for messages received `SINCE` the cursor date. Only the ~50 newest
 * messages are mapped, and each one carries its IMAP UID in [RawMail.cursor].
 *
 * ### Cursor format (important for Task 12)
 * The account cursor is an opaque, composite token:
 *
 * ```
 * yyyy-MM-dd#<uid>
 * ```
 *
 * e.g. `2026-10-04#12345`. The date half drives the IMAP `SINCE` search on the
 * next poll, and the numeric half (the max UID of the batch) is used to drop
 * messages that were already fetched. This is the "clean resolution" of the
 * brief's date-vs-UID cursor ambiguity: the plan said *search SINCE the cursor
 * date* **and** *surface the max UID as the new cursor*, which a single scalar
 * cursor cannot express on its own. A plain `yyyy-MM-dd` cursor (no `#uid`) is
 * also accepted so newly-linked accounts and manual cursors keep working.
 *
 * Call [newCursor] after [listOtpCandidates] and persist the result with
 * `EmailAccounts.setCursor(id, cursor)`. A null result means "no new messages":
 * leave the stored cursor untouched.
 *
 * ### Credentials
 * IMAP uses [EmailAccount.address] + the app password stored in
 * [EmailAccount.secretRef]. [EmailAccount.imapHost] and [EmailAccount.imapPort]
 * default to port [DEFAULT_IMAP_PORT]. Missing host or password fails fast with
 * an [IllegalStateException] rather than attempting an anonymous connection.
 */
class ImapConnector(private val account: EmailAccount) : EmailConnector {

    override fun id(): String = account.id

    override fun listOtpCandidates(since: String?): List<RawMail> {
        val host = account.imapHost?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("IMAP account '${account.id}' has no imapHost")
        val port = account.imapPort ?: DEFAULT_IMAP_PORT
        val password = account.secretRef?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("IMAP account '${account.id}' has no app password (secretRef)")

        val props = Properties().apply {
            put("mail.store.protocol", PROTOCOL)
            put("mail.imaps.host", host)
            put("mail.imaps.port", port.toString())
            put("mail.imaps.ssl.enable", "true")
            put("mail.imaps.connectiontimeout", CONNECT_TIMEOUT_MS.toString())
            put("mail.imaps.timeout", CONNECT_TIMEOUT_MS.toString())
        }

        val store = Session.getInstance(props).getStore(PROTOCOL)
        try {
            store.connect(host, account.address, password)
            val folder = store.getFolder(INBOX)
            folder.open(Folder.READ_ONLY)
            try {
                return collect(folder, since)
            } finally {
                runCatching { folder.close(false) }
            }
        } finally {
            runCatching { store.close() }
        }
    }

    /**
     * Pure mapping step over an already-open folder. Separated from the network
     * code so it can be unit-tested with a fake/`Folder` (no live IMAP).
     */
    internal fun collect(folder: Folder, since: String?): List<RawMail> {
        val sinceDate = parseSince(since)
        val cursorUid = parseCursorUid(since)

        val searchTerm = ReceivedDateTerm(ComparisonTerm.GE, sinceDate)
        val uidFolder = folder as? UIDFolder
        val found = folder.search(searchTerm)

        return found
            .map { message -> UidMessage(message, uidFolder.readUid(message)) }
            .filter { record -> cursorUid == null || record.uid > cursorUid }
            .sortedWith(compareByDescending<UidMessage> { it.uid }.thenByDescending { it.receivedAt })
            .take(MAX_MESSAGES)
            .map { record -> toRawMail(record.message, record.uid) }
    }

    /**
     * Cursor to persist after a poll returned [mails]: `yyyy-MM-dd#<maxUid>`, or
     * null when the batch is empty (leave the stored cursor unchanged). Messages
     * from [collect] are returned newest-UID-first, so the batch maximum is also
     * the global maximum for the search window.
     */
    fun newCursor(mails: List<RawMail>): String? {
        val maxUid = mails.mapNotNull { it.cursor?.toLongOrNull() }.maxOrNull() ?: return null
        val maxReceivedAt = mails.maxOfOrNull { it.receivedAt } ?: System.currentTimeMillis()
        return "${formatDate(Date(maxReceivedAt))}#$maxUid"
    }

    /** Parses the date half of a cursor, falling back to [defaultLookback] when absent/unparseable. */
    internal fun parseSince(cursor: String?): Date {
        val datePart = cursor?.substringBefore('#')?.trim()
        if (!datePart.isNullOrEmpty()) {
            val parsed = runCatching {
                SimpleDateFormat(DATE_FORMAT, Locale.US).apply {
                    isLenient = false
                    timeZone = TimeZone.getTimeZone("UTC")
                }.parse(datePart)
            }.getOrNull()
            if (parsed != null) return parsed
        }
        return defaultLookback()
    }

    /** Parses the UID half of a cursor; null for a date-only cursor. */
    internal fun parseCursorUid(cursor: String?): Long? {
        if (cursor.isNullOrBlank()) return null
        val uidPart = if (cursor.contains('#')) cursor.substringAfter('#') else cursor
        return uidPart.trim().toLongOrNull()
    }

    private fun toRawMail(message: Message, uid: Long): RawMail = RawMail(
        messageId = message.messageIdHeader() ?: "<uid:$uid@imap>",
        from = message.fromAddress(),
        subject = message.safeSubject(),
        snippetBody = boundSnippet(stripHtml(message.bodyText())),
        receivedAt = message.receivedAtMillis(),
        cursor = uid.toString(),
    )

    private fun UIDFolder?.readUid(message: Message): Long =
        if (this == null) 0L else runCatching { getUID(message) }.getOrDefault(0L)

    private fun Message.messageIdHeader(): String? =
        runCatching { getHeader("Message-ID")?.firstOrNull()?.trim()?.takeIf { it.isNotEmpty() } }.getOrNull()

    private fun Message.fromAddress(): String {
        val first = runCatching { from?.firstOrNull() }.getOrNull()
        return when (first) {
            is InternetAddress -> first.address ?: first.toString()
            null -> ""
            else -> first.toString()
        }
    }

    private fun Message.safeSubject(): String =
        runCatching { subject ?: "" }.getOrDefault("")

    private fun Message.receivedAtMillis(): Long {
        val date = runCatching { receivedDate }.getOrNull() ?: runCatching { sentDate }.getOrNull()
        return date?.time ?: 0L
    }

    private fun Message.bodyText(): String = runCatching {
        when (val content = content) {
            is String -> content
            is Multipart -> multipartText(content, depth = 0)
            else -> ""
        }
    }.getOrDefault("")

    private fun multipartText(multipart: Multipart, depth: Int): String {
        if (depth > MAX_MULTIPART_DEPTH) return ""
        val out = StringBuilder()
        for (index in 0 until multipart.count) {
            val part: BodyPart = runCatching { multipart.getBodyPart(index) }.getOrNull() ?: continue
            val partContent = runCatching { part.content }.getOrNull() ?: continue
            when {
                partContent is Multipart -> out.append(multipartText(partContent, depth + 1))
                part.isPlainText() -> out.append(partContent as? String ?: "")
            }
        }
        return out.toString()
    }

    private fun BodyPart.isPlainText(): Boolean =
        runCatching { contentType?.lowercase(Locale.US)?.startsWith("text/plain") == true }.getOrDefault(false)

    private fun stripHtml(raw: String): String {
        val withoutBlocks = BLOCK_ELEMENT.replace(raw, " ")
        val withoutTags = HTML_TAG.replace(withoutBlocks, " ")
        return ENTITIES.fold(withoutTags) { text, (entity, replacement) -> text.replace(entity, replacement) }
    }

    private fun boundSnippet(raw: String): String {
        val collapsed = WHITESPACE.replace(raw, " ").trim()
        return if (collapsed.length > MAX_SNIPPET_CHARS) collapsed.take(MAX_SNIPPET_CHARS) else collapsed
    }

    private fun defaultLookback(): Date =
        Date(System.currentTimeMillis() - DEFAULT_LOOKBACK_DAYS * MILLIS_PER_DAY)

    private fun formatDate(date: Date): String =
        SimpleDateFormat(DATE_FORMAT, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(date)

    private data class UidMessage(val message: Message, val uid: Long) {
        val receivedAt: Long
            get() = runCatching { message.receivedDate?.time }.getOrNull() ?: 0L
    }

    companion object {
        const val PROTOCOL = "imaps"
        const val INBOX = "INBOX"
        const val DEFAULT_IMAP_PORT = 993
        const val DATE_FORMAT = "yyyy-MM-dd"

        /** How many messages are mapped per poll. */
        const val MAX_MESSAGES = 50

        /** Plain-text body cap; the OTP window only reads a few hundred chars. */
        const val MAX_SNIPPET_CHARS = 500

        /** Lookback used when no (valid) cursor is supplied. */
        const val DEFAULT_LOOKBACK_DAYS = 2

        private const val CONNECT_TIMEOUT_MS = 8_000
        private const val MAX_MULTIPART_DEPTH = 5
        private const val MILLIS_PER_DAY = 86_400_000L

        private val BLOCK_ELEMENT = Regex("(?is)<(script|style)[^>]*>.*?</\\1>")
        private val HTML_TAG = Regex("<[^>]*>")
        private val WHITESPACE = Regex("\\s+")
        private val ENTITIES = listOf(
            "&nbsp;" to " ",
            "&amp;" to "&",
            "&lt;" to "<",
            "&gt;" to ">",
            "&quot;" to "\"",
            "&#39;" to "'",
        )
    }
}
