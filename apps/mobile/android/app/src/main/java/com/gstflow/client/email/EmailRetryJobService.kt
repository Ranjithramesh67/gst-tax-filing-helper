package com.gstflow.client.email

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.util.Log

/**
 * Retries email OTP outbox uploads in the background.
 *
 * Mirrors [com.gstflow.client.sms.SmsRetryJobService]. The foreground service
 * only runs briefly per SMS, so an OTP that could not be uploaded immediately
 * (no network, expired token) is durably queued and drained here once
 * connectivity returns — even if the app process was killed in the meantime,
 * because the job is persisted.
 */
class EmailRetryJobService : JobService() {
    override fun onStartJob(params: JobParameters?): Boolean {
        val context = applicationContext
        // Consent can be revoked after an item is queued; never upload without it.
        if (!EmailAccounts.isConsentGranted(context)) {
            Log.i(TAG, "Email-reading consent not granted; skipping outbox retry")
            jobFinished(params, false)
            return true
        }
        Thread {
            var reschedule = false
            try {
                val store = EmailOtpOutbox.store(context)
                val pending = store.all()
                if (pending.isNotEmpty()) {
                    val done = HashSet<String>(pending.size)
                    for (item in pending) {
                        if (EmailUploader.upload(context, item)) done.add(item.sourceRef)
                    }
                    if (done.isNotEmpty()) store.remove(done)
                }
                reschedule = store.size() > 0
            } catch (error: Exception) {
                Log.w(TAG, "Email outbox retry failed: ${error.message}")
                reschedule = EmailOtpOutbox.size(context) > 0
            } finally {
                jobFinished(params, reschedule)
            }
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters?): Boolean = true

    companion object {
        private const val TAG = "EmailRetryJobService"
        private const val JOB_ID = 7303

        /** Schedules the upload retry job if it is not already pending. */
        fun schedule(context: Context) {
            try {
                val scheduler =
                    context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
                if (scheduler.getPendingJob(JOB_ID) != null) return
                val component = ComponentName(context, EmailRetryJobService::class.java)
                val job = JobInfo.Builder(JOB_ID, component)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true)
                    .setBackoffCriteria(10_000L, JobInfo.BACKOFF_POLICY_LINEAR)
                    .build()
                scheduler.schedule(job)
            } catch (error: Exception) {
                Log.w(TAG, "Unable to schedule retry job: ${error.message}")
            }
        }
    }
}
