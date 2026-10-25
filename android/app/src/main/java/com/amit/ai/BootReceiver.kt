package com.amit.ai

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/** Brings the wake-word listener and bubble back after a reboot or app update. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_MY_PACKAGE_REPLACED &&
            action != "android.intent.action.QUICKBOOT_POWERON"
        ) return

        if (AssistantPrefs.wakeEnabled(context)) {
            try {
                val i = Intent(context, WakeWordService::class.java)
                    .setAction(WakeWordService.ACTION_START)
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i)
                else context.startService(i)
            } catch (_: Throwable) {
            }
        }
        if (AssistantPrefs.bubbleEnabled(context)) {
            try {
                context.startService(Intent(context, BubbleService::class.java))
            } catch (_: Throwable) {
            }
        }

        // Every AlarmManager alarm is wiped by a reboot (and by an app update).
        // Rebuild them from the stored list; repeating jobs move to their next
        // slot instead of firing yesterday's time at boot.
        try {
            AmitSchedulerModule.rescheduleAll(context)
        } catch (_: Throwable) {
        }
    }
}
