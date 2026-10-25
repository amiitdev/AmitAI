package com.amit.ai

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject

/**
 * Cron for AmitAI: AlarmManager alarms plus the notification that carries the
 * finished answer.
 *
 * JS owns the fancy date maths (weekdays, cron fields, DST-correct wall clock)
 * and only tells us "fire at this epoch ms". We keep a copy in
 * SharedPreferences so BootReceiver can restore alarms without JS, and so a
 * repeating job still advances even if the headless task fails to start.
 *
 *   JS: src/lib/schedules.ts (applySchedules) → NativeModules.AmitScheduler
 */
class AmitSchedulerModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "AmitScheduler"

    init {
        ensureChannel(ctx)
    }

    /** Replace the whole alarm set. Idempotent: safe to call on every app start. */
    @ReactMethod
    fun replaceAll(json: String, promise: Promise) {
        try {
            val wanted = parse(json)
            val before = readEntries(ctx)
            for (e in before) cancel(ctx, e.id)
            writeEntries(ctx, wanted)

            val now = System.currentTimeMillis()
            var scheduled = 0
            for (e in wanted) {
                var at = e.at
                if (e.repeatMs > 0) {
                    // A stale repeat (app was closed for a while) fires once, soon.
                    while (at <= now) at += e.repeatMs
                }
                if (at <= now) continue
                scheduleAt(ctx, e.copy(at = at))
                scheduled++
            }
            promise.resolve(scheduled)
        } catch (e: Throwable) {
            promise.reject("scheduler_replace", e)
        }
    }

    @ReactMethod
    fun status(promise: Promise) {
        try {
            val m = Arguments.createMap()
            m.putBoolean("exact", canExact(ctx))
            m.putBoolean(
                "notifications",
                if (Build.VERSION.SDK_INT >= 33)
                    ctx.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == 0
                else true,
            )
            m.putInt("alarms", readEntries(ctx).size)
            promise.resolve(m)
        } catch (e: Throwable) {
            promise.reject("scheduler_status", e)
        }
    }

    /** Android 12+: exact alarms need a per-app system toggle. */
    @ReactMethod
    fun requestExact(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= 31 && !canExact(ctx)) {
                val i = Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                i.data = Uri.parse("package:${ctx.packageName}")
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(i)
            }
            promise.resolve(canExact(ctx))
        } catch (e: Throwable) {
            promise.reject("scheduler_exact", e)
        }
    }

    /** Post a finished scheduled answer. */
    @ReactMethod
    fun notify(id: String, title: String, body: String, promise: Promise) {
        try {
            post(ctx, id, title, body)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("scheduler_notify", e)
        }
    }

    companion object {
        const val PREFS = "amitai_schedules"
        const val KEY = "entries"
        const val ACTION_FIRE = "com.amit.ai.SCHEDULE_FIRE"
        const val CHANNEL = "amitai_tasks"

        data class Entry(
            val id: String,
            val title: String,
            val prompt: String,
            val at: Long,
            val repeatMs: Long,
        )

        fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        fun parse(json: String): List<Entry> {
            val out = mutableListOf<Entry>()
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val id = o.optString("id")
                if (id.isBlank()) continue
                out.add(
                    Entry(
                        id = id,
                        title = o.optString("title", "AmitAI task"),
                        prompt = o.optString("prompt"),
                        at = o.optLong("at", 0L),
                        repeatMs = o.optLong("repeatMs", 0L),
                    ),
                )
            }
            return out
        }

        fun readEntries(c: Context): List<Entry> = parse(prefs(c).getString(KEY, "[]") ?: "[]")

        fun writeEntries(c: Context, list: List<Entry>) {
            val arr = JSONArray()
            for (e in list) {
                arr.put(
                    JSONObject()
                        .put("id", e.id)
                        .put("title", e.title)
                        .put("prompt", e.prompt)
                        .put("at", e.at)
                        .put("repeatMs", e.repeatMs),
                )
            }
            prefs(c).edit().putString(KEY, arr.toString()).apply()
        }

        fun upsert(c: Context, entry: Entry) {
            val list = readEntries(c).filter { it.id != entry.id }.toMutableList()
            list.add(entry)
            writeEntries(c, list)
        }

        fun removeEntry(c: Context, id: String) {
            writeEntries(c, readEntries(c).filter { it.id != id })
        }

        private fun pendingIntent(c: Context, id: String): PendingIntent {
            val i = Intent(c, ScheduleReceiver::class.java).apply {
                action = ACTION_FIRE
                data = Uri.parse("amitai://schedule/$id")
                putExtra("id", id)
            }
            return PendingIntent.getBroadcast(
                c,
                id.hashCode(),
                i,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        fun canExact(c: Context): Boolean {
            if (Build.VERSION.SDK_INT < 31) return true
            val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            return am.canScheduleExactAlarms()
        }

        fun scheduleAt(c: Context, entry: Entry) {
            val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pi = pendingIntent(c, entry.id)
            try {
                if (canExact(c)) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entry.at, pi)
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entry.at, pi)
                }
            } catch (_: SecurityException) {
                // Toggle was revoked between the check and the call.
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entry.at, pi)
            }
        }

        fun cancel(c: Context, id: String) {
            val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.cancel(pendingIntent(c, id))
        }

        /**
         * After a reboot or an app update every alarm is gone. Rebuild the set
         * from prefs, moving repeating jobs forward to their next real slot.
         */
        fun rescheduleAll(c: Context) {
            val now = System.currentTimeMillis()
            val kept = mutableListOf<Entry>()
            for (e in readEntries(c)) {
                if (e.repeatMs <= 0) {
                    // One-shot whose time passed while the phone was off: skip it
                    // rather than firing yesterday's weather at boot.
                    if (e.at > now) {
                        kept.add(e)
                        scheduleAt(c, e)
                    }
                } else {
                    var at = e.at
                    while (at <= now) at += e.repeatMs
                    val next = e.copy(at = at)
                    kept.add(next)
                    scheduleAt(c, next)
                }
            }
            writeEntries(c, kept)
        }

        fun ensureChannel(c: Context) {
            if (Build.VERSION.SDK_INT < 26) return
            val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL) != null) return
            val ch = NotificationChannel(
                CHANNEL,
                "Scheduled answers",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Answers from jobs you scheduled, e.g. the 8 am weather."
                setShowBadge(true)
            }
            nm.createNotificationChannel(ch)
        }

        fun post(c: Context, id: String, title: String, body: String) {
            ensureChannel(c)
            val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val open = Intent(c, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("amit_task", id)
            }
            val pi = PendingIntent.getActivity(
                c,
                id.hashCode(),
                open,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

            val clean = body.replace(Regex("```[\\s\\S]*?```"), " (code) ")
                .replace(Regex("[*_#>|`]"), "")
                .replace(Regex("\\s+"), " ")
                .trim()
            val short = if (clean.length > 1800) clean.take(1800) + "…" else clean

            val notif: Notification = NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title.ifBlank { "AmitAI task" })
                .setContentText(short.take(140))
                .setStyle(NotificationCompat.BigTextStyle().bigText(short))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build()

            nm.notify((id.hashCode() and 0x7fffffff), notif)
        }
    }
}
