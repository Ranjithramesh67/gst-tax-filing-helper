package com.gstflow.client.email

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Parity suite for [OtpExtractor]. The fixture file is an unmodified copy of
 * `packages/otp/fixtures/otp-fixtures.json`, and the expected snippets below are
 * the verbatim output of the TypeScript `extractOtp` implementation.
 */
class OtpExtractorTest {
    private val fixtures: JSONArray by lazy { loadFixtures() }

    @Test
    fun fixtureCodesMatchTypeScript() {
        for (i in 0 until fixtures.length()) {
            val fixture = fixtures.getJSONObject(i)
            val input = fixture.getString("text")
            val note = fixture.optString("note")
            val result = OtpExtractor.extract(input)
            if (fixture.isNull("expect")) {
                assertNull("$note should not extract an OTP", result)
            } else {
                val expected = fixture.getJSONObject("expect").getString("code")
                assertEquals("$note code", expected, result?.code)
            }
        }
    }

    @Test
    fun fixtureSnippetsMatchTypeScript() {
        val expected = mapOf(
            "123456 is your OTP for login. Do not share." to
                "•••• is your OTP for login. Do not share.",
            "Use 4831 to verify your email" to
                "Use •••• to verify your email",
            "Your one time password is A1B2C3" to
                "Your one time password is ••••",
        )
        for (i in 0 until fixtures.length()) {
            val text = fixtures.getJSONObject(i).getString("text")
            val wanted = expected[text] ?: continue
            assertEquals("snippet for \"$text\"", wanted, OtpExtractor.extract(text)?.snippet)
        }
    }

    @Test
    fun masksTheCodeInsideTheSnippet() {
        val result = OtpExtractor.extract("Your verification code is 778899 now")
        assertEquals("778899", result?.code)
        assertEquals("Your verification code is •••• now", result?.snippet)
    }

    @Test
    fun rejectsGstNoiseBeforeTheKeyword() {
        assertNull(OtpExtractor.extract("invoice no 8891 — verify 4831"))
    }

    @Test
    fun selectsTheTokenNearestTheKeyword() {
        val result = OtpExtractor.extract("On 2026 your OTP is 4831")
        assertEquals("4831", result?.code)
        assertEquals("On 2026 your OTP is ••••", result?.snippet)
    }

    @Test
    fun masksEveryOccurrenceOfTheCodeInTheSnippet() {
        val result = OtpExtractor.extract("Your code 123456 — code again 123456")
        assertEquals("123456", result?.code)
        assertEquals("Your code •••• — code again ••••", result?.snippet)
    }

    @Test
    fun returnsNullForBlankInput() {
        assertNull(OtpExtractor.extract(null))
        assertNull(OtpExtractor.extract(""))
    }

    private fun loadFixtures(): JSONArray {
        val stream = javaClass.classLoader?.getResourceAsStream(FIXTURE_FILE)
            ?: error("$FIXTURE_FILE not found on the test classpath")
        val text = stream.bufferedReader().use { it.readText() }
        return JSONArray(text)
    }

    private companion object {
        const val FIXTURE_FILE = "otp-fixtures.json"
    }
}
