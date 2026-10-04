package com.gstflow.client.email

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM tests for the pure outbox queue logic. Backed by an in-memory
 * [KeyValueStore] so no Android/prefs/network is involved.
 */
class EmailOtpOutboxTest {

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

    private val prefs = FakePrefs()
    private val store = EmailOtpOutboxStore(prefs)

    private fun otp(ref: String, receivedAt: Long = 1_700_000_000_000L) = EmailOtp(
        code = "4831",
        fromAddress = "bank@example.com",
        subject = "Your OTP",
        snippet = "Your code is ••••",
        receivedAt = receivedAt,
        sourceRef = ref,
        accountId = "acc-1",
    )

    @Test
    fun addAndReadBackPreservesFields() {
        store.add(otp("<m1@example.com>"))

        val item = store.all().single()
        assertEquals("4831", item.code)
        assertEquals("bank@example.com", item.fromAddress)
        assertEquals("Your OTP", item.subject)
        assertEquals("Your code is ••••", item.snippet)
        assertEquals(1_700_000_000_000L, item.receivedAt)
        assertEquals("<m1@example.com>", item.sourceRef)
        assertEquals("acc-1", item.accountId)
        assertEquals(1, store.size())
    }

    @Test
    fun dedupsBySourceRefKeepingTheFirst() {
        store.add(otp("<m1@example.com>"))

        store.add(otp("<m1@example.com>", receivedAt = 42L))

        assertEquals(1, store.size())
        assertEquals(1_700_000_000_000L, store.all().single().receivedAt)
    }

    @Test
    fun ignoresEmptySourceRef() {
        store.add(otp(""))

        assertEquals(0, store.size())
    }

    @Test
    fun capsAt500DroppingOldest() {
        for (index in 0..500) store.add(otp("ref-$index"))

        assertEquals(EmailOtpOutboxStore.MAX_ITEMS, store.size())
        val refs = store.all().map { it.sourceRef }
        assertTrue("oldest must be dropped", "ref-0" !in refs)
        assertTrue("newest must be kept", "ref-500" in refs)
    }

    @Test
    fun removeDeletesOnlyTheGivenRefs() {
        store.add(otp("a"))
        store.add(otp("b"))
        store.add(otp("c"))

        store.remove(setOf("a", "c"))

        assertEquals(listOf("b"), store.all().map { it.sourceRef })
    }

    @Test
    fun removeWithEmptySetIsANoOp() {
        store.add(otp("a"))

        store.remove(emptySet())

        assertEquals(1, store.size())
    }

    @Test
    fun returnsEmptyOnCorruptPayload() {
        prefs.putString(EmailOtpOutboxStore.KEY, "{not json")

        assertEquals(0, store.size())
        assertTrue(store.all().isEmpty())
    }

    @Test
    fun survivesANewStoreOverTheSamePrefs() {
        store.add(otp("a"))

        val reopened = EmailOtpOutboxStore(prefs)

        assertEquals(listOf("a"), reopened.all().map { it.sourceRef })
        assertNull(EmailOtp.fromJson(org.json.JSONObject("{}")))
    }
}
