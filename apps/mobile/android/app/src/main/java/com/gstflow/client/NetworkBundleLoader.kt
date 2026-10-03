package com.gstflow.client

import com.facebook.react.bridge.JSBundleLoader
import com.facebook.react.bridge.JSBundleLoaderDelegate
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Loads the JavaScript bundle from an HTTPS URL at startup and caches it on disk.
 *
 * A stock React Native debug build fetches its bundle from Metro over cleartext
 * `http://` / `ws://`. The only reachable endpoint in this environment is the
 * HTTPS preview proxy, which Metro cannot speak. Downloading the bundle ourselves
 * over HTTPS lets a debug build receive updated JavaScript without being
 * reinstalled: after the bundle is regenerated, a reload (or app restart)
 * re-downloads it.
 *
 * [loadScript] runs on the React context thread, never the UI thread, so the
 * blocking download is safe here.
 */
class NetworkBundleLoader(
    private val sourceUrl: String,
    private val cacheFile: File,
) : JSBundleLoader() {

    override fun loadScript(delegate: JSBundleLoaderDelegate): String {
        val parent = cacheFile.parentFile
        if (parent != null && !parent.exists()) {
            parent.mkdirs()
        }

        val tempFile = File(cacheFile.absolutePath + ".tmp")
        val connection = (URL(sourceUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", "GSTFlowClient/1.0 (Android)")
            setRequestProperty("Accept", "*/*")
        }

        try {
            connection.connect()
            val status = connection.responseCode
            if (status !in 200..299) {
                throw IllegalStateException(
                    "JS bundle download failed: HTTP $status from $sourceUrl"
                )
            }
            connection.inputStream.use { input ->
                tempFile.outputStream().use { output -> input.copyTo(output) }
            }
        } finally {
            connection.disconnect()
        }

        if (!tempFile.renameTo(cacheFile)) {
            tempFile.copyTo(cacheFile, overwrite = true)
            tempFile.delete()
        }

        delegate.loadScriptFromFile(cacheFile.absolutePath, sourceUrl, false)
        return sourceUrl
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 120_000
    }
}
