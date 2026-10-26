package com.amit.ai

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

/**
 * Keeps the loopback MCP server answering while AmitAI is in the background.
 *
 * Without this, Android freezes a backgrounded app: the socket stays open (so
 * connections still succeed) but no thread runs to read them, and the opencode
 * agent times out after ~15 s. A foreground service makes the process exempt
 * from the freezer, which is exactly what a tool server needs — the agent calls
 * it precisely when AmitAI is *not* the app on screen.
 *
 * `specialUse` is the honest foreground type here: this is neither audio, nor
 * location, nor a data upload — it is a local IPC endpoint. Android 14+ wants a
 * declared type plus a human-readable subtype (see AndroidManifest.xml).
 */
class McpService : Service() {

    companion object {
        private const val CHANNEL = "amit_mcp"
        private const val NOTIF_ID = 4712
        const val ACTION_START = "com.amit.ai.MCP_START"
        const val ACTION_STOP = "com.amit.ai.MCP_STOP"

        @Volatile
        var running = false
            private set

        /** Starts the service the safe way for each API level. */
        fun startService(ctx: Context) {
            try {
                val i = Intent(ctx, McpService::class.java).setAction(ACTION_START)
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i)
                else ctx.startService(i)
            } catch (_: Throwable) {
            }
        }

        /** Stops the service; onDestroy closes the listening socket. */
        fun stopService(ctx: Context) {
            try {
                ctx.stopService(Intent(ctx, McpService::class.java))
            } catch (_: Throwable) {
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            AmitMcpServer.stop()
            running = false
            AssistantPrefs.setMcpServiceEnabled(this, false)
            stopForegroundCompat()
            stopSelf()
            return START_NOT_STICKY
        }

        startForegroundCompat()
        AmitMcpServer.start(this)
        running = true
        AssistantPrefs.setMcpServiceEnabled(this, true)
        // START_STICKY: if Android kills the process it restarts the service with
        // a null intent, which reopens the socket on the next onStartCommand.
        return START_STICKY
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
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL, "Tool server", NotificationManager.IMPORTANCE_LOW).apply {
                        description = "Keeps AmitAI's MCP tools reachable by the opencode agent"
                        setShowBadge(false)
                    }
                )
            }
        }
    }

    private fun buildNotification(): Notification {
        val open = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val pi = PendingIntent.getActivity(
            this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, McpService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val b = if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(this, CHANNEL)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return b.setContentTitle("AmitAI tools ready")
            .setContentText("opencode can call memory, weather and time on 127.0.0.1:${AmitMcpServer.PORT}")
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentIntent(pi)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stop)
            .build()
    }

    override fun onDestroy() {
        running = false
        // The service is the owner of the socket: closing it here is what makes
        // "Stop" in the notification actually free port 8140.
        AmitMcpServer.stop()
        super.onDestroy()
    }
}
