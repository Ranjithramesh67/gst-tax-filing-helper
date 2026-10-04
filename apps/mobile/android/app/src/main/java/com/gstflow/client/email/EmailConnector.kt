package com.gstflow.client.email

/**
 * A single message surfaced by an [EmailConnector], reduced to the fields the OTP
 * pipeline needs. [snippetBody] is a bounded plain-text excerpt (see
 * [ImapConnector.MAX_SNIPPET_CHARS]) because only the OTP extraction window of a
 * few hundred characters is ever inspected.
 */
data class RawMail(
    val messageId: String,
    val from: String,
    val subject: String,
    val snippetBody: String,
    val receivedAt: Long,
    /**
     * Connector-specific cursor token for this message. IMAP uses the message UID
     * (monotonically increasing); Gmail would use its `historyId`. This field is
     * the additive hook the Task 11 brief allows so [EmailConnector.listOtpCandidates]
     * can keep returning a plain `List<RawMail>` while still surfacing the cursor
     * the poller must persist via `EmailAccounts.setCursor(id, cursor)`.
     */
    val cursor: String? = null,
)

/**
 * Source of raw mail for OTP aggregation. Implementations are expected to be
 * side-effect free apart from the network read; the caller owns persistence of
 * the cursor (see [RawMail.cursor]).
 */
interface EmailConnector {
    /** Stable id of the backing [EmailAccount]. */
    fun id(): String

    /**
     * Fetches candidate messages received at or after [since]. [since] is the
     * previously persisted cursor (an opaque, connector-defined string); a null
     * or unparseable value means "start from the connector's default lookback".
     */
    fun listOtpCandidates(since: String?): List<RawMail>

    /**
     * Cursor to persist after a poll returned [mails], or null when there is
     * nothing to advance to (leave the stored cursor unchanged). Kept on the
     * interface so a generic poller can round-trip the cursor without casting to
     * a concrete connector. The default returns the numeric maximum
     * [RawMail.cursor] when every cursor parses as a number, otherwise the
     * lexicographic maximum; connectors with richer cursor semantics (e.g. IMAP's
     * `yyyy-MM-dd#uid`) override this.
     */
    fun newCursor(mails: List<RawMail>): String? {
        val cursors = mails.mapNotNull { it.cursor }
        if (cursors.isEmpty()) return null
        val numeric = cursors.mapNotNull { it.toLongOrNull() }
        return if (numeric.size == cursors.size) {
            numeric.maxOrNull()?.toString()
        } else {
            cursors.maxOrNull()
        }
    }
}
