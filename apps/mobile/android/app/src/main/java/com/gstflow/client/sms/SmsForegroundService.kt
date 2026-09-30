package com.gstflow.client.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.gstflow.client.MainActivity

/**
 * dataSync foreground service.
 *
 * It keeps the process alive while SMS listening is enabled, posts a persistent
 * notification, and "drains" filtered SMS: each ingest is dispatched to the JS
 * native module (or persisted to the native buffer when JS is not attached) so
 * the encrypted JS queue can pick it up and sync.
 */
class SmsForegroundService : Service() {

    @Volatile
    private var listening = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                listening = true
                startForegroundCompat(getStringSafe("Listening for GST SMS"))
                return START_STICKY
            }

            ACTION_STOP -> {
                listening = false
                stopForegroundCompat()
                stopSelf()
                return START_NOT_STICKY
            }

            ACTION_INGEST -> {
                startForegroundCompat(getStringSafe("Processing GST SMS"))
                val sender = intent.getStringExtra(EXTRA_SENDER).orEmpty()
                val body = intent.getStringExtra(EXTRA_BODY).orEmpty()
                val timestamp = intent.getLongExtra(EXTRA_TIMESTAMP, System.currentTimeMillis())
                if (body.isNotEmpty() && GstFilter.isGstRelated(body)) {
                    SmsReaderModule.dispatch(this, IncomingSms(sender, body, timestamp))
                }
                if (!listening) {
                    stopForegroundCompat()
                    stopSelf(startId)
                }
                return START_NOT_STICKY
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        listening = false
        super.onDestroy()
    }

    private fun startForegroundCompat(text: String) {
        val notification = buildNotification(text)
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            } else {
                0
            },
        )
    }

    @Suppress("DEPRECATION")
    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            stopForeground(true)
        }
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
            description = getStringSafe("Keeps GSTFlow listening for GST-related SMS")
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
        const val ACTION_START = "com.gstflow.client.sms.action.START"
        const val ACTION_STOP = "com.gstflow.client.sms.action.STOP"
        const val ACTION_INGEST = "com.gstflow.client.sms.action.INGEST"

        const val EXTRA_SENDER = "com.gstflow.client.sms.extra.SENDER"
        const val EXTRA_BODY = "com.gstflow.client.sms.extra.BODY"
        const val EXTRA_TIMESTAMP = "com.gstflow.client.sms.extra.TIMESTAMP"

        private const val CHANNEL_ID = "gstflow_sms_sync"
        private const val NOTIFICATION_ID = 7301
    }
}
