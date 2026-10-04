package com.gstflow.client.email

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * JVM tests for the bridge's IMAP input validation. Pure logic: no Android and
 * no network. The @ReactMethod wrapper itself is exercised in Task 19's manual
 * verification on a device.
 */
class EmailAccountValidationTest {

    @Test
    fun acceptsAWellFormedImapAccount() {
        assertNull(EmailAccountValidation.validateImap("user@example.com", "app-pass", "imap.example.com", 993))
    }

    @Test
    fun boundaryPortsAreValid() {
        assertNull(EmailAccountValidation.validateImap("user@example.com", "app-pass", "imap.example.com", 1))
        assertNull(EmailAccountValidation.validateImap("user@example.com", "app-pass", "imap.example.com", 65535))
    }

    @Test
    fun rejectsBlankAddress() {
        assertEquals(
            "address must not be blank",
            EmailAccountValidation.validateImap("   ", "app-pass", "imap.example.com", 993),
        )
    }

    @Test
    fun rejectsNonEmailAddress() {
        assertEquals(
            "address must be a valid email",
            EmailAccountValidation.validateImap("not-an-email", "app-pass", "imap.example.com", 993),
        )
    }

    @Test
    fun rejectsBlankPassword() {
        assertEquals(
            "password must not be blank",
            EmailAccountValidation.validateImap("user@example.com", "", "imap.example.com", 993),
        )
    }

    @Test
    fun rejectsBlankHost() {
        assertEquals(
            "host must not be blank",
            EmailAccountValidation.validateImap("user@example.com", "app-pass", " ", 993),
        )
    }

    @Test
    fun rejectsOutOfRangePorts() {
        assertEquals(
            "port must be between 1 and 65535",
            EmailAccountValidation.validateImap("user@example.com", "app-pass", "imap.example.com", 0),
        )
        assertEquals(
            "port must be between 1 and 65535",
            EmailAccountValidation.validateImap("user@example.com", "app-pass", "imap.example.com", 65536),
        )
    }
}
