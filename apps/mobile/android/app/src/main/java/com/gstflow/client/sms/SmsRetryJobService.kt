package com.gstflow.client.sms

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.util.Log

/**
 * Retries outbox uploads in the background.
 *
 * SMS_RECEIVED delivery starts the app process only briefly; a foreground
 * service cannot be started from the background on Android 12+ without an
 * exemption. A JobScheduler job, by contrast, is allowed to run in the
 * background and survives the app being swiped away (when persisted), so a
 * message captured while the app was killed is forwarded once connectivity is
 * available.
 */
class SmsRetryJobService : JobService() {
    override fun onStartJob(params: JobParameters?): Boolean {
        val context = applicationContext
        Thread {
            var reschedule = false
            try {
                val pending = SmsOutbox.all(context)
                if (pending.isNotEmpty()) {
                    val done = HashSet<String>(pending.size)
                    for (sms in pending) {
                        if (SmsUploader.upload(context, sms)) done.add(sms.hash)
                    }
                    if (done.isNotEmpty()) SmsOutbox.remove(context, done)
                }
                reschedule = SmsOutbox.size(context) > 0
            } catch (error: Exception) {
                Log.w(TAG, "Outbox retry failed: ${error.message}")
                reschedule = SmsOutbox.size(context) > 0
            } finally {
                jobFinished(params, reschedule)
            }
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters?): Boolean = true

    companion object {
        private const val TAG = "SmsRetryJobService"
        private const val JOB_ID = 7302

        /** Schedules the upload retry job if it is not already pending. */
        fun schedule(context: Context) {
            try {
                val scheduler =
                    context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
                if (scheduler.getPendingJob(JOB_ID) != null) return
                val component = ComponentName(context, SmsRetryJobService::class.java)
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
