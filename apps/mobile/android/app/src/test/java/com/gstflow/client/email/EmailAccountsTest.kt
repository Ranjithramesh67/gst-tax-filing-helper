package com.gstflow.client.email

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EmailAccountsTest {
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
    private val store = EmailAccountStore(prefs)

    private fun account(id: String = "acc-1") = EmailAccount(
        id = id,
        provider = EmailProvider.IMAP,
        address = "user@example.com",
        imapHost = "imap.example.com",
        imapPort = 993,
        secretRef = "secret:$id",
    )

    @Test
    fun roundTripsSaveGetAndList() {
        store.save(account())
        store.save(account("acc-2").copy(provider = EmailProvider.GMAIL, oauthTokenJson = "{\"t\":\"x\"}"))

        assertEquals(account(), store.get("acc-1"))
        assertEquals(listOf("acc-1", "acc-2"), store.list().map { it.id })
        assertEquals("{\"t\":\"x\"}", store.get("acc-2")?.oauthTokenJson)
        assertEquals(EmailProvider.GMAIL, store.get("acc-2")?.provider)
    }

    @Test
    fun removeDeletesOnlyTheTarget() {
        store.save(account("acc-1"))
        store.save(account("acc-2"))

        store.remove("acc-1")

        assertNull(store.get("acc-1"))
        assertEquals(listOf("acc-2"), store.list().map { it.id })
    }

    @Test
    fun saveUpsertsByID() {
        store.save(account())
        store.save(account().copy(address = "changed@example.com", enabled = false))

        assertEquals(1, store.list().size)
        assertEquals("changed@example.com", store.get("acc-1")?.address)
        assertEquals(false, store.get("acc-1")?.enabled)
    }

    @Test
    fun updatesCursor() {
        store.save(account())

        store.setCursor("acc-1", "uid:42")

        assertEquals("uid:42", store.get("acc-1")?.cursor)
    }

    @Test
    fun marksStatus() {
        store.save(account())

        store.markStatus("acc-1", 1_700_000_000_000L, "auth failed")

        assertEquals(1_700_000_000_000L, store.get("acc-1")?.lastPolledAt)
        assertEquals("auth failed", store.get("acc-1")?.lastError)

        store.markStatus("acc-1", 1_700_000_000_001L, null)
        assertNull(store.get("acc-1")?.lastError)
    }

    @Test
    fun statusMutationsIgnoreUnknownAccounts() {
        store.save(account())

        store.setCursor("missing", "uid:1")
        store.markStatus("missing", 1L, "boom")

        assertEquals(1, store.list().size)
        assertNull(store.get("missing"))
    }

    @Test
    fun survivesANewStoreOverTheSamePrefs() {
        store.save(account())
        store.setCursor("acc-1", "uid:7")

        val reopened = EmailAccountStore(prefs)

        assertEquals("uid:7", reopened.get("acc-1")?.cursor)
        assertEquals("imap.example.com", reopened.get("acc-1")?.imapHost)
        assertEquals(993, reopened.get("acc-1")?.imapPort)
    }

    @Test
    fun returnsEmptyOnCorruptPayload() {
        prefs.putString(EmailAccountStore.KEY_ACCOUNTS, "{not json")

        assertTrue(store.list().isEmpty())
        assertNull(store.get("acc-1"))
    }

    @Test
    fun skipsUnparseableAccountsButKeepsTheRest() {
        val raw = account("acc-1").toJson().toString() + ",{\"id\":\"bad\"}"
        prefs.putString(EmailAccountStore.KEY_ACCOUNTS, "[${raw}]")

        assertEquals(listOf("acc-1"), store.list().map { it.id })
    }

    @Test
    fun publicProjectionOmitsSecretsButKeepsMetadata() {
        store.save(
            account("acc-1").copy(
                cursor = "2026-10-04#9",
                lastPolledAt = 1_700_000_000_000L,
                lastError = null,
                oauthTokenJson = "{\"token\":\"secret\"}",
            ),
        )

        val json = store.get("acc-1")!!.toPublicJson()

        assertFalse("secretRef must never cross the bridge", json.has("secretRef"))
        assertFalse("oauthTokenJson must never cross the bridge", json.has("oauthTokenJson"))
        assertEquals("acc-1", json.getString("id"))
        assertEquals("IMAP", json.getString("provider"))
        assertEquals("user@example.com", json.getString("address"))
        assertEquals("imap.example.com", json.getString("imapHost"))
        assertEquals(993, json.getInt("imapPort"))
        assertEquals("2026-10-04#9", json.getString("cursor"))
        assertEquals(true, json.getBoolean("enabled"))
        assertEquals(1_700_000_000_000L, json.getLong("lastPolledAt"))
    }

    @Test
    fun setEnabledTogglesTheFlag() {
        store.save(account())

        store.setEnabled("acc-1", false)
        assertEquals(false, store.get("acc-1")?.enabled)

        store.setEnabled("acc-1", true)
        assertEquals(true, store.get("acc-1")?.enabled)
    }
}
