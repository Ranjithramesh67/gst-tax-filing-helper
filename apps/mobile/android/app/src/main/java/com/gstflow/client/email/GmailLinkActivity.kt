@file:Suppress("DEPRECATION") // Google Sign-In is the flow pinned by the Task 15 brief.

package com.gstflow.client.email

import android.accounts.Account
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.google.android.gms.auth.GoogleAuthUtil
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import java.util.UUID

/**
 * Transparent activity that runs the Google Sign-In flow for linking a Gmail
 * mailbox and persists the resulting OAuth token into the encrypted
 * [EmailAccounts] store.
 *
 * It is started for result by [EmailAccountModule.linkGmail]; the module owns
 * the pending RN promise and only ever receives a non-secret result: either
 * `RESULT_OK` (no extras required) or `RESULT_CANCELED` with an
 * [EXTRA_ERROR] message. The access token never leaves the encrypted store and
 * is never passed through an Intent or logged.
 *
 * The GoogleSignIn/GoogleAuthUtil calls require Google Play services and a
 * configured Google Cloud OAuth client (Android package + SHA-1) with the
 * `gmail.readonly` scope; see the Task 15 prerequisite note.
 */
class GmailLinkActivity : Activity() {

    private var signInClient: GoogleSignInClient? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // A configuration change must not launch a second sign-in prompt.
        if (savedInstanceState != null) return
        val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestScopes(Scope(GmailConnector.GMAIL_SCOPE))
            .build()
        val client = GoogleSignIn.getClient(this, options)
        signInClient = client
        startActivityForResult(client.signInIntent, RC_SIGN_IN)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != RC_SIGN_IN) return

        val account = try {
            GoogleSignIn.getSignedInAccountFromIntent(data).getResult(ApiException::class.java)
        } catch (error: ApiException) {
            finishWithError("Google sign-in failed (status ${error.statusCode})")
            return
        }

        val email = account?.email
        val androidAccount = account?.account
        if (email.isNullOrBlank() || androidAccount == null) {
            finishWithError("Google sign-in returned no account")
            return
        }

        // Token acquisition hits the network; keep it off the UI thread.
        Thread { storeAccount(androidAccount, email) }.start()
    }

    private fun storeAccount(androidAccount: Account, email: String) {
        val token = try {
            GoogleAuthUtil.getToken(
                applicationContext,
                androidAccount,
                "oauth2:${GmailConnector.GMAIL_SCOPE}",
            )
        } catch (error: Exception) {
            Log.w(TAG, "Google token fetch failed: ${error.javaClass.simpleName}")
            null
        }

        runOnUiThread {
            if (token.isNullOrBlank()) {
                finishWithError("Could not obtain a Gmail access token")
                return@runOnUiThread
            }
            try {
                val id = UUID.randomUUID().toString()
                EmailAccounts.save(
                    EmailAccount(
                        id = id,
                        provider = EmailProvider.GMAIL,
                        address = email,
                        oauthTokenJson = GmailTokenJson.build(token, email),
                        cursor = null,
                        enabled = true,
                    ),
                )
                setResult(RESULT_OK, Intent().putExtra(EXTRA_ACCOUNT_ID, id))
                finish()
            } catch (error: Exception) {
                Log.w(TAG, "Gmail account persistence failed: ${error.javaClass.simpleName}")
                finishWithError("Could not store the linked Gmail account")
            }
        }
    }

    private fun finishWithError(message: String) {
        setResult(RESULT_CANCELED, Intent().putExtra(EXTRA_ERROR, message))
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        signInClient = null
    }

    companion object {
        private const val TAG = "GmailLinkActivity"
        private const val RC_SIGN_IN = 48152

        const val EXTRA_ERROR = "error"
        const val EXTRA_ACCOUNT_ID = "accountId"
    }
}
