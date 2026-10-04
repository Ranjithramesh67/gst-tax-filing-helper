package com.gstflow.client.email

import kotlin.math.abs

// ECMAScript `\s` is broader than the JVM `\s`: JS also treats NBSP (`\u00A0`),
// narrow NBSP (`\u202F`) and the other Unicode space separators as whitespace.
// Emails frequently carry these (e.g. from HTML `&nbsp;`), so use the exact JS set
// both for the keyword separators and for the whitespace-collapse step.
private const val ECMASCRIPT_WS =
    "\u0009\u000A\u000B\u000C\u000D \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF"

private val KEYWORD = Regex(
    "\\b(otp|one[$ECMASCRIPT_WS-]?time[$ECMASCRIPT_WS-]?password|verification[$ECMASCRIPT_WS-]?code|security[$ECMASCRIPT_WS-]?code|login[$ECMASCRIPT_WS-]?code|verification|verify|code)\\b",
    RegexOption.IGNORE_CASE,
)
private val GST_NOISE = Regex(
    "\\b(gstin|gstn|gstr|arn|invoice|hsn|tax|amount|rs\\.?)\\b",
    RegexOption.IGNORE_CASE,
)
private val TOKEN = Regex("\\b[A-Za-z0-9]{4,8}\\b")
private val PURE_CODE = Regex("^(otp|code)$", RegexOption.IGNORE_CASE)
private val HAS_DIGIT = Regex("[0-9]")
private val WHITESPACE = Regex("[$ECMASCRIPT_WS]+")
private val ECMASCRIPT_WS_CHAR = Regex("[$ECMASCRIPT_WS]")
private const val WINDOW = 160
private const val MASK = "••••"

data class ExtractedOtp(val code: String, val snippet: String)

/**
 * On-device mirror of the `@gstflow/otp` extractor. Kept behaviourally identical to
 * the TypeScript implementation: it finds the first keyword match, scans a window
 * around it, rejects GST-flavoured noise, then picks the alphanumeric token nearest
 * the keyword (preferring the token that appears after the keyword on a tie). The
 * chosen code is upper-cased and masked everywhere in the returned snippet.
 */
object OtpExtractor {
    fun extract(input: String?): ExtractedOtp? {
        if (input.isNullOrEmpty()) return null

        val match = KEYWORD.find(input) ?: return null
        val matchIndex = match.range.first

        val windowStart = (matchIndex - WINDOW).coerceAtLeast(0)
        val windowEnd = (matchIndex + WINDOW).coerceAtMost(input.length)
        val window = input.substring(windowStart, windowEnd)
        if (GST_NOISE.containsMatchIn(window)) return null

        val keywordPos = matchIndex - windowStart
        val candidates = TOKEN.findAll(window)
            .filter { found ->
                HAS_DIGIT.containsMatchIn(found.value) && !PURE_CODE.matches(found.value)
            }
            .map { found ->
                val index = found.range.first
                Candidate(
                    value = found.value,
                    distance = abs(index - keywordPos),
                    after = index >= keywordPos,
                )
            }
            .sortedWith(compareBy({ it.distance }, { if (it.after) 0 else 1 }))
            .toList()

        val token = candidates.firstOrNull()?.value ?: return null

        val start = (matchIndex - 40).coerceAtLeast(0)
        val end = (matchIndex + 120).coerceAtMost(input.length)
        val mask = Regex("\\b${Regex.escape(token)}\\b")
        val snippet = input.substring(start, end)
            .replace(mask, MASK)
            .replace(WHITESPACE, " ")
            .trim { ECMASCRIPT_WS_CHAR.matches(it.toString()) }

        return ExtractedOtp(code = token.uppercase(), snippet = snippet)
    }

    private data class Candidate(val value: String, val distance: Int, val after: Boolean)
}
