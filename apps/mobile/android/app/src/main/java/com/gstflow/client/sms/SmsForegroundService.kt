package com.gstflow.client.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.gstflow.client.MainActivity
import com.gstflow.client.email.EmailPoller
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * dataSync foreground service.
 *
 * Started per SMS (not kept alive) so Android permits the background ingest and
 * shows only a short-lived notification. Each ingest is dispatched to the JS
 * native module (or persisted to the native buffer when JS is not attached) so
 * the encrypted JS queue can pick it up and sync. The notification is removed
 * as soon as the message has been forwarded.
 */
class SmsForegroundService : Service() {

    // Uploads run off the main thread; the service stays foreground until they
    // finish so the process is not killed mid-request.
    private val uploadExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    // Email polling runs on its own thread so a slow mailbox read can never
    // delay the SMS upload above. Throttled to the 15-min cadence by the poller.
    private val pollExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    // Held only while an upload is in flight so a sleeping device still completes
    // the request and forwards the OTP/SMS.
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        // Poll email on the service tick (at most once per 15 min). The service
        // is started per SMS, so this opportunistically refreshes email OTPs
        // without changing the existing per-message SMS behavior.
        pollExecutor.execute { EmailPoller.pollIfDue(applicationContext) }
    }

    override fun onDestroy() {
        releaseWakeLock()
        uploadExecutor.shutdown()
        pollExecutor.shutdown()
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForegroundCompat()
                stopSelf()
                return START_NOT_STICKY
            }

            ACTION_INGEST -> {
                // A foreground service is started per message (rather than kept
                // alive with an ongoing notification) so the notification is
                // removed as soon as the SMS has been handed to JS and uploaded.
                startForegroundCompat(getStringSafe("Forwarding GST SMS"))
                val sender = intent.getStringExtra(EXTRA_SENDER).orEmpty()
                val body = intent.getStringExtra(EXTRA_BODY).orEmpty()
                val timestamp = intent.getLongExtra(EXTRA_TIMESTAMP, System.currentTimeMillis())
                if (body.isNotEmpty() && SmsKeywords.matches(this, body, sender)) {
                    val sms = IncomingSms(sender, body, timestamp)
                    // Hand the message to JS when the app is alive (drives the
                    // in-app queue/log). Delivery, however, must not depend on
                    // JS running: upload directly from native so an SMS received
                    // while the app is closed still reaches the backend.
                    SmsReaderModule.dispatch(this, sms)
                    acquireWakeLock()
                    uploadExecutor.execute {
                        try {
                            SmsUploader.upload(applicationContext, sms)
                        } finally {
                            releaseWakeLock()
                            stopForegroundCompat()
                            stopSelf(startId)
                        }
                    }
                    return START_NOT_STICKY
                }
                stopForegroundCompat()
                stopSelf(startId)
                return START_NOT_STICKY
            }
        }
        return START_NOT_STICKY
    }

    private fun startForegroundCompat(text: String) {
        val notification = buildNotification(text)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    @Suppress("DEPRECATION")
    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            stopForeground(true)
        }
    }

    /**
     * Holds a short-lived partial wake lock so the ingest upload completes even
     * if the device tries to sleep (e.g. power saver + screen off). Released as
     * soon as the request finishes; auto-released by the system after 60s.
     */
    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val power = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "gstflow:sms-upload").apply {
            setReferenceCounted(false)
            try {
                acquire(WAKE_LOCK_TIMEOUT_MS)
            } catch (error: Exception) {
                Log.w(TAG, "Unable to acquire wake lock: ${error.message}")
            }
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.takeIf { it.isHeld }?.release()
        } catch (error: Exception) {
            Log.w(TAG, "Unable to release wake lock: ${error.message}")
        }
        wakeLock = null
    }

    private fun buildNotification(text: String): Notification {
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getStringSafe("GSTFlow"))
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(contentIntent)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getStringSafe("GST SMS sync"),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getStringSafe("Notifies when a GST SMS is being forwarded")
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    /**
     * Avoids a hard dependency on app string resources so the native module can
     * build without a generated R.string table.
     */
    private fun getStringSafe(fallback: String): String = fallback

    companion object {
        const val ACTION_STOP = "com.gstflow.client.sms.action.STOP"
        const val ACTION_INGEST = "com.gstflow.client.sms.action.INGEST"

        const val EXTRA_SENDER = "com.gstflow.client.sms.extra.SENDER"
        const val EXTRA_BODY = "com.gstflow.client.sms.extra.BODY"
        const val EXTRA_TIMESTAMP = "com.gstflow.client.sms.extra.TIMESTAMP"

        private const val CHANNEL_ID = "gstflow_sms_sync"
        private const val NOTIFICATION_ID = 7301
        private const val TAG = "SmsForegroundService"
        private const val WAKE_LOCK_TIMEOUT_MS = 60_000L

        /** Removes the transient ingest notification if it is still showing. */
        fun clearNotification(context: Context) {
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)
                ?.cancel(NOTIFICATION_ID)
        }
    }
}
