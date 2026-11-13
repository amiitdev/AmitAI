package com.amit.ai.automation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import com.amit.ai.MainActivity

/**
 * Keeps Action Mode alive while AmitAI is *not* the app on screen.
 *
 * This is not cosmetic. Android freezes cached processes, so the moment the
 * agent opens YouTube, a plain backgrounded AmitAI would stop running the
 * tool loop: the next `get_screen_content` would never execute and the user
 * would watch a half-finished automation. A foreground service keeps the
 * process out of the freezer, exactly like McpService already does for the tool
 * server.
 *
 * The ongoing notification doubles as the required "automation is active"
 * indicator and as the emergency stop, reachable even when the app's own UI is
 * behind another app.
 *
 * Battery: the service stops itself 5 minutes after the last action, and it is
 * only started when a session actually uses an automation tool. No wake locks.
 */
class AutomationService : Service() {

    companion object {
        private const val CHANNEL = "amit_automation"
        private const val NOTIF_ID = 4713
        const val ACTION_START = "com.amit.ai.AUTOMATION_START"
        const val ACTION_STOP = "com.amit.ai.AUTOMATION_STOP"
        private const val IDLE_LIMIT_MS = 5 * 60 * 1000L
        private const val TICK_MS = 2_000L

        @Volatile
        var running = false
            private set

        fun start(ctx: Context) {
            try {
                val i = Intent(ctx, AutomationService::class.java).setAction(ACTION_START)
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i)
                else ctx.startService(i)
            } catch (_: Throwable) {
                // Background-start restrictions (Android 12+): the session still
                // works while AmitAI is visible, so this is not fatal.
            }
        }

        fun stop(ctx: Context) {
            try {
                ctx.stopService(Intent(ctx, AutomationService::class.java))
            } catch (_: Throwable) {
            }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var lastNotificationText = ""

    private val tick = object : Runnable {
        override fun run() {
            val idle = AutomationManager.idleMs()
            if (!AutomationState.sessionActive || (idle >= 0 && idle > IDLE_LIMIT_MS)) {
                AutomationManager.endSession(applicationContext)
                try {
                    stopForegroundCompat()
                } catch (_: Throwable) {
                    // endSession already asked the system to stop us.
                }
                stopSelf()
                return
            }
            refreshNotification()
            handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            AutomationManager.stop(this, "Stopped from the notification")
            stopForegroundCompat()
            stopSelf()
            return START_NOT_STICKY
        }
        startForegroundCompat()
        running = true
        handler.removeCallbacks(tick)
        handler.post(tick)
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        handler.removeCallbacks(tick)
        super.onDestroy()
    }

    private fun refreshNotification() {
        val nm = getSystemService(NotificationManager::class.java) ?: return
        val text = buildText()
        if (text == lastNotificationText) return
        lastNotificationText = text
        try {
            nm.notify(NOTIF_ID, buildNotification())
        } catch (_: Throwable) {
        }
    }

    private fun buildText(): String {
        val app = AutomationState.currentAppLabel.ifBlank { AutomationState.currentPackage }
        val action = AutomationState.currentAction
        return when {
            action.isNotBlank() && app.isNotBlank() -> "$action · $app"
            action.isNotBlank() -> action
            app.isNotBlank() -> "Watching $app"
            else -> "Action Mode is on — AmitAI is standing by"
        }
    }

    private fun startForegroundCompat() {
        val n = buildNotification()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, n)
        }
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE)
        else @Suppress("DEPRECATION") stopForeground(true)
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CHANNEL) != null) return
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL,
                "Action Mode",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Shown while AmitAI is controlling the screen for you"
                setShowBadge(false)
            },
        )
    }

    private fun buildNotification(): Notification {
        val open = Intent(this, MainActivity::class.java).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP,
            )
            putExtra("amit_action_mode", true)
        }
        val pi = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, AutomationService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(this, CHANNEL)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("AmitAI is acting on screen")
            .setContentText(buildText())
            .setSmallIcon(android.R.drawable.ic_menu_send)
            .setContentIntent(pi)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stop)
            .build()
    }
}
