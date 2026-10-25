package com.amit.ai

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The alarm itself. Two jobs, in this order:
 *
 * 1. Move the repeating alarm to its next slot and save it — before any JS runs.
 *    If the phone is low on memory and the headless task never starts, the
 *    schedule still survives to the next day instead of silently dying.
 * 2. Ask the headless task to run the agent and post the answer.
 */
class ScheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != AmitSchedulerModule.ACTION_FIRE) return
        val id = intent.getStringExtra("id") ?: return

        val entry = AmitSchedulerModule.readEntries(context).firstOrNull { it.id == id }
        if (entry != null) {
            if (entry.repeatMs > 0) {
                var next = entry.at + entry.repeatMs
                val now = System.currentTimeMillis()
                while (next <= now) next += entry.repeatMs
                val moved = entry.copy(at = next)
                AmitSchedulerModule.upsert(context, moved)
                AmitSchedulerModule.scheduleAt(context, moved)
            } else {
                AmitSchedulerModule.removeEntry(context, id)
            }
        }

        try {
            val svc = Intent(context, ScheduleTaskService::class.java).apply {
                putExtra("id", id)
                putExtra("title", entry?.title ?: "AmitAI task")
                putExtra("prompt", entry?.prompt ?: "")
            }
            // A broadcast from an alarm puts the app on the temporary allowlist,
            // so a normal startService() is permitted here (no foreground type).
            context.startService(svc)
        } catch (_: Throwable) {
            // Nothing else we can do; the next alarm is already set.
        }
    }
}
