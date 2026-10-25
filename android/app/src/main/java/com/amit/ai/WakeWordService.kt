package com.amit.ai

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File

/**
 * Always-listening "Ok Amit" service.
 *
 * Vosk runs fully offline on a 40 MB model the app downloads once. A small
 * grammar means the recogniser only has to tell "amit" apart from noise, which
 * keeps CPU (and battery) far below general speech recognition.
 *
 * Audio is never stored or uploaded — samples go into the recogniser and are
 * dropped. The service respects the user's listening policy and yields the
 * microphone whenever AmitAI is on screen or Google's recogniser is running
 * (see MicGate), so tapping the mic in the app always works.
 */
class WakeWordService : Service() {

    companion object {
        private const val TAG = "AmitWake"
        private const val CHANNEL = "amit_wake"
        private const val NOTIF_ID = 4711
        const val ACTION_START = "com.amit.ai.WAKE_START"
        const val ACTION_STOP = "com.amit.ai.WAKE_STOP"
        const val ACTION_RELOAD = "com.amit.ai.WAKE_RELOAD"

        @Volatile
        var running = false
            private set
    }

    private var thread: Thread? = null
    @Volatile private var active = false

    private var model: Model? = null
    private var recognizer: Recognizer? = null
    private var record: AudioRecord? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var lastWake = 0L

    private val powerReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            AssistantBus.emit("AmitAssistantState", "listening", listeningNow().toString())
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        createChannel()
        registerReceiver(powerReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
        })
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AmitAI:WakeWord").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_RELOAD -> {
                stopLoop()
                startForegroundCompat("Say “Ok Amit”")
                startLoop()
                return START_STICKY
            }
        }

        startForegroundCompat("Say “Ok Amit”")
        if (thread == null || thread?.isAlive != true) startLoop()
        return START_STICKY
    }

    private fun startForegroundCompat(text: String) {
        val n = buildNotification(text)
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIF_ID, n)
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL, "Wake word", NotificationManager.IMPORTANCE_LOW).apply {
                        description = "Keeps “Ok Amit” listening in the background"
                        setShowBadge(false)
                    }
                )
            }
        }
    }

    private fun buildNotification(text: String): Notification {
        val open = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("amit_voice", true)
        }
        val pi = PendingIntent.getActivity(
            this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, WakeWordService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val b = if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(this, CHANNEL)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return b.setContentTitle("AmitAI")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pi)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stop)
            .build()
    }

    private fun updateNotification(text: String) {
        try {
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .notify(NOTIF_ID, buildNotification(text))
        } catch (_: Throwable) {
        }
    }

    /* ------------------------------ policies ------------------------------ */

    private fun isCharging(): Boolean {
        val i = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return false
        val status = i.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        return status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
    }

    private fun isScreenOn(): Boolean =
        (getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive

    private fun listeningNow(): Boolean {
        val policy = AssistantPrefs.policy(this)
        return when (policy) {
            AssistantPrefs.POLICY_ALWAYS -> true
            AssistantPrefs.POLICY_APP_ONLY -> false
            else -> isCharging() || !isScreenOn()
        }
    }

    /* ------------------------------- engine ------------------------------- */

    private fun startLoop() {
        if (!AssistantPrefs.modelReady(this)) {
            Log.w(TAG, "model missing at ${AssistantPrefs.modelDir(this)}")
            AssistantBus.emit("AmitAssistantError", "message", "Wake-word model is not downloaded yet.")
            updateNotification("Model missing — open AmitAI to download it")
            return
        }
        active = true
        thread = Thread({ runLoop() }, "amit-wake").apply { isDaemon = true; start() }
    }

    private fun stopLoop() {
        active = false
        try {
            thread?.join(1500)
        } catch (_: Throwable) {
        }
        thread = null
        releaseAudio()
    }

    private fun releaseAudio() {
        try {
            record?.stop()
        } catch (_: Throwable) {
        }
        try {
            record?.release()
        } catch (_: Throwable) {
        }
        record = null
        try {
            recognizer?.close()
        } catch (_: Throwable) {
        }
        recognizer = null
        try {
            model?.close()
        } catch (_: Throwable) {
        }
        model = null
    }

    private fun runLoop() {
        try {
            val path = AssistantPrefs.modelDir(this).absolutePath
            model = Model(path)
            recognizer = Recognizer(model, 16000.0f, "[\"ok amit\", \"hey amit\", \"amit\", \"[unk]\"]")

            val min = AudioRecord.getMinBufferSize(
                16000,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            val bufSize = maxOf(min, 6400)
            val rec = AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                16000,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufSize * 2
            )
            if (rec.state != AudioRecord.STATE_INITIALIZED) {
                AssistantBus.emit("AmitAssistantError", "message", "Microphone is busy — close other recorder apps.")
                rec.release()
                stopSelf()
                return
            }
            record = rec

            val buf = ShortArray(bufSize / 2)
            var recording = false
            var wasListening = false

            while (active) {
                // MicGate wins over the policy: when the app is on screen the
                // user needs the mic for Google STT, so Vosk lets go of it.
                val listen = listeningNow() && !MicGate.blocked

                if (listen != wasListening) {
                    wasListening = listen
                    if (listen) {
                        try {
                            rec.startRecording()
                            recording = true
                            recognizer?.reset()
                        } catch (e: Throwable) {
                            Log.w(TAG, "startRecording failed", e)
                        }
                    } else {
                        try {
                            if (recording) rec.stop()
                        } catch (_: Throwable) {
                        }
                        recording = false
                    }
                    AssistantBus.emit("AmitAssistantState", "listening", listen.toString())
                    updateNotification(
                        when {
                            listen -> "Say “Ok Amit”"
                            MicGate.appVisible -> "Paused while AmitAI is open"
                            MicGate.sttActive -> "Paused while listening to you"
                            else -> "Paused (policy) — tap to open"
                        }
                    )
                }

                if (!listen) {
                    SystemClock.sleep(250)
                    continue
                }

                if (!recording) continue

                val n = rec.read(buf, 0, buf.size)
                if (n <= 0) continue
                val rec2 = recognizer ?: break
                val text = if (rec2.acceptWaveForm(buf, n)) {
                    JSONObject(rec2.getResult()).optString("text", "")
                } else {
                    JSONObject(rec2.getPartialResult()).optString("partial", "")
                }
                if (text.contains("amit", ignoreCase = true)) onWake(text)
            }
        } catch (e: Throwable) {
            Log.e(TAG, "wake loop failed", e)
            AssistantBus.emit("AmitAssistantError", "message", e.message ?: "Wake word stopped")
        } finally {
            releaseAudio()
        }
    }

    private fun onWake(heard: String) {
        val now = SystemClock.elapsedRealtime()
        if (now - lastWake < 2500) return
        lastWake = now
        Log.i(TAG, "wake: $heard")

        try {
            val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(60)
            }
        } catch (_: Throwable) {
        }

        updateNotification("Opening AmitAI…")
        AssistantBus.emit("AmitAssistantWake", "phrase", heard)

        val open = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("amit_voice", true)
        }
        try {
            startActivity(open)
        } catch (e: Throwable) {
            Log.w(TAG, "could not open activity", e)
        }
    }

    override fun onDestroy() {
        active = false
        running = false
        try {
            unregisterReceiver(powerReceiver)
        } catch (_: Throwable) {
        }
        releaseAudio()
        try {
            wakeLock?.release()
        } catch (_: Throwable) {
        }
        wakeLock = null
        AssistantBus.emit("AmitAssistantState", "listening", "false")
        super.onDestroy()
    }
}
