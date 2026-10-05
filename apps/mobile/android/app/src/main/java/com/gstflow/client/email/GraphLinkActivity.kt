package com.gstflow.client.email

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.microsoft.identity.client.AcquireTokenParameters
import com.microsoft.identity.client.AuthenticationCallback
import com.microsoft.identity.client.IAuthenticationResult
import com.microsoft.identity.client.IAccount
import com.microsoft.identity.client.PublicClientApplication
import com.microsoft.identity.client.exception.MsalException
import java.util.UUID

/**
 * Transparent activity that runs the Microsoft sign-in flow (MSAL) for linking
 * a Microsoft 365 / Outlook mailbox and persists the resulting OAuth token into
 * the encrypted [EmailAccounts] store.
 *
 * It is started for result by [EmailAccountModule.linkGraph]; the module owns the
 * pending RN promise and only ever receives a non-secret result: either
 * `RESULT_OK` (no extras required) or `RESULT_CANCELED` with an [EXTRA_ERROR]
 * message. The access token never leaves the encrypted store and is never passed
 * through an Intent or logged.
 *
 * MSAL reads its client id / redirect URI from `res/raw/msal_config.json`, which
 * must be populated from an Azure app registration with the delegated
 * `Mail.Read` permission (a Task 16 prerequisite, mirroring the Google Cloud
 * OAuth client needed by [GmailLinkActivity]). MSAL caches the account on device;
 * [GraphTokens.refresh] later acquires `Mail.Read` tokens silently from that
 * cache.
 */
class GraphLinkActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // A configuration change must not launch a second sign-in prompt.
        if (savedInstanceState != null) return
        // Creating the application touches disk; keep it off the UI thread.
        Thread { createApplicationAndSignIn() }.start()
    }

    private fun createApplicationAndSignIn() {
        val app = try {
            PublicClientApplication.createMultipleAccountPublicClientApplication(
                applicationContext,
                com.gstflow.client.R.raw.msal_config,
            )
        } catch (error: MsalException) {
            finishWithError("Microsoft sign-in is not configured (${error.errorCode})")
            return
        } catch (error: Exception) {
            Log.w(TAG, "MSAL application creation failed: ${error.javaClass.simpleName}")
            finishWithError("Could not start Microsoft sign-in")
            return
        }

        runOnUiThread {
            try {
                app.acquireToken(
                    AcquireTokenParameters.Builder()
                        .withScopes(listOf(GraphConnector.GRAPH_SCOPE))
                        .startAuthorizationFromActivity(this)
                        .withCallback(callback)
                        .build(),
                )
            } catch (error: Exception) {
                Log.w(TAG, "Microsoft sign-in launch failed: ${error.javaClass.simpleName}")
                finishWithError("Could not start Microsoft sign-in")
            }
        }
    }

    private val callback = object : AuthenticationCallback {
        override fun onSuccess(authenticationResult: IAuthenticationResult?) {
            storeAccount(authenticationResult)
        }

        override fun onError(exception: MsalException?) {
            finishWithError("Microsoft sign-in failed (${exception?.errorCode ?: "unknown"})")
        }

        override fun onCancel() {
            finishWithError("Microsoft sign-in was cancelled")
        }
    }

    private fun storeAccount(result: IAuthenticationResult?) {
        val account: IAccount? = result?.account
        val token = result?.accessToken
        val username: String? = account?.username
        if (account == null || token.isNullOrBlank() || username.isNullOrBlank()) {
            finishWithError("Microsoft sign-in returned no account")
            return
        }
        // Persisting touches encrypted disk; keep it off the UI thread.
        Thread { persistAccount(account, token, username) }.start()
    }

    private fun persistAccount(account: IAccount, token: String, username: String) {
        try {
            val id = UUID.randomUUID().toString()
            EmailAccounts.save(
                EmailAccount(
                    id = id,
                    provider = EmailProvider.GRAPH,
                    address = username,
                    oauthTokenJson = GraphTokenJson.build(token, username, account.id),
                    cursor = null,
                    enabled = true,
                ),
            )
            runOnUiThread {
                setResult(RESULT_OK, Intent().putExtra(EXTRA_ACCOUNT_ID, id))
                finish()
            }
        } catch (error: Exception) {
            Log.w(TAG, "Graph account persistence failed: ${error.javaClass.simpleName}")
            finishWithError("Could not store the linked Microsoft account")
        }
    }

    private fun finishWithError(message: String) {
        runOnUiThread {
            setResult(RESULT_CANCELED, Intent().putExtra(EXTRA_ERROR, message))
            finish()
        }
    }

    companion object {
        private const val TAG = "GraphLinkActivity"

        const val EXTRA_ERROR = "error"
        const val EXTRA_ACCOUNT_ID = "accountId"
    }
}
