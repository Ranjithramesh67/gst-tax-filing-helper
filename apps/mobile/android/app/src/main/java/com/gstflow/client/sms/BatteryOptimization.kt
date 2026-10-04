package com.gstflow.client.sms

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * Helpers for keeping SMS capture and upload alive while the device is in
 * battery-saver / Doze mode.
 *
 * Android defers background work for apps that are not battery-optimization
 * exempt. Because a GST SMS (including an OTP) must reach the backend even when
 * the screen is off, the app asks the user to exempt it, and offers the
 * OEM-specific autostart screen on manufacturers that restrict it further.
 */
object BatteryOptimization {
    private const val TAG = "BatteryOptimization"

    /** True when the OS will not defer this app's background work. */
    fun isIgnoringOptimizations(context: Context): Boolean {
        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
        return try {
            power.isIgnoringBatteryOptimizations(context.packageName)
        } catch (error: Exception) {
            Log.w(TAG, "Unable to read battery optimization state: ${error.message}")
            false
        }
    }

    /**
     * Asks the system to whitelist the app via the standard dialog. Falls back to
     * the battery-optimization settings list when the direct dialog is
     * unavailable (some OEM builds restrict it).
     */
    fun requestExemption(context: Context): Boolean {
        if (isIgnoringOptimizations(context)) return true
        val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return start(context, direct) || openOptimizationSettings(context)
    }

    /** Opens the system battery-optimization list where the user can pick the app. */
    fun openOptimizationSettings(context: Context): Boolean {
        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return start(context, intent)
    }

    /**
     * Opens the manufacturer's "autostart"/"protected apps" screen when present,
     * otherwise the app details page. Aggressive OEM ROMs kill background apps
     * even when the standard battery exemption is granted, so this is offered as
     * a follow-up step.
     */
    fun openAutoStartSettings(context: Context): Boolean {
        for (intent in autoStartIntents()) {
            if (start(context, intent)) return true
        }
        val details = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", context.packageName, null)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return start(context, details)
    }

    fun manufacturer(): String = Build.MANUFACTURER?.lowercase()?.trim() ?: ""

    /**
     * Best-effort list of OEM autostart screens. Each intent is tried in order;
     * missing components simply fail to launch and are skipped.
     */
    private fun autoStartIntents(): List<Intent> {
        val maker = manufacturer()
        val intents = mutableListOf<Intent>()
        fun add(pkg: String, cls: String) {
            intents.add(
                Intent().apply {
                    component = android.content.ComponentName(pkg, cls)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                },
            )
        }
        when {
            maker.contains("xiaomi") || maker.contains("redmi") || maker.contains("poco") ->
                add(
                    "com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity",
                )
            maker.contains("huawei") || maker.contains("honor") -> {
                add("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")
                add("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")
            }
            maker.contains("oppo") || maker.contains("realme") -> {
                add("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")
                add("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")
                add("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity")
            }
            maker.contains("vivo") || maker.contains("iqoo") ->
                add("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")
            maker.contains("oneplus") ->
                add("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity")
            maker.contains("asus") ->
                add("com.asus.mobilemanager", "com.asus.mobilemanager.MainActivity")
            maker.contains("meizu") ->
                add("com.meizu.safe", "com.meizu.safe.permission.SmartBGActivity")
            else -> Unit
        }
        return intents
    }

    private fun start(context: Context, intent: Intent): Boolean {
        return try {
            context.startActivity(intent)
            true
        } catch (error: Exception) {
            Log.d(TAG, "Unable to launch ${intent.component ?: intent.action}: ${error.message}")
            false
        }
    }
}
