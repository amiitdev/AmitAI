package com.amit.ai

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

/**
 * Assistant shell: wake-word model management, foreground listener, overlay
 * bubble, and the permission hand-offs those need.
 *
 * Kept separate from AmitVoiceModule (speech in/out) so each file stays small
 * enough to reason about.
 */
class AmitAssistantModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    init {
        AssistantBus.reactContext = ctx
        ctx.addLifecycleEventListener(object : com.facebook.react.bridge.LifecycleEventListener {
            override fun onHostResume() { MicGate.appVisible = true }
            override fun onHostPause() { MicGate.appVisible = false }
            override fun onHostDestroy() { MicGate.appVisible = false }
        })
    }

    override fun getName() = "AmitAssistant"

    private fun startService(action: String? = null) {
        val i = Intent(ctx, WakeWordService::class.java)
        if (action != null) i.action = action
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
    }

    /* -------------------------------- status ------------------------------- */

    @ReactMethod
    fun status(promise: Promise) {
        try {
            val m = Arguments.createMap()
            m.putBoolean("model", AssistantPrefs.modelReady(ctx))
            m.putDouble("modelBytes", dirSize(AssistantPrefs.modelDir(ctx)).toDouble())
            m.putBoolean("listening", WakeWordService.running)
            m.putBoolean("wake", AssistantPrefs.wakeEnabled(ctx))
            m.putBoolean("bubble", AssistantPrefs.bubbleEnabled(ctx))
            m.putString("policy", AssistantPrefs.policy(ctx))
            m.putBoolean("overlay", canOverlay())
            m.putBoolean("battery", ignoringBattery())
            m.putBoolean(
                "notifications",
                if (Build.VERSION.SDK_INT >= 33)
                    ctx.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == 0
                else true
            )
            promise.resolve(m)
        } catch (e: Throwable) {
            promise.reject("status_failed", e)
        }
    }

    private fun dirSize(dir: File): Long =
        if (!dir.exists()) 0L
        else dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }

    /* ------------------------------- model --------------------------------- */

    @ReactMethod
    fun downloadModel(promise: Promise) {
        if (AssistantPrefs.modelReady(ctx)) {
            promise.resolve(true)
            return
        }
        Thread {
            val zip = File(ctx.filesDir, "vosk-model.zip")
            try {
                AssistantBus.emit("AmitAssistantModel", "phase", "downloading")
                val conn = (URL(MODEL_URL).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20000
                    readTimeout = 30000
                    instanceFollowRedirects = true
                }
                conn.connect()
                if (conn.responseCode !in 200..299) {
                    throw RuntimeException("HTTP ${conn.responseCode} from model host")
                }
                val total = conn.contentLength.toLong()
                var read = 0L
                var lastPct = -1
                conn.inputStream.use { input ->
                    FileOutputStream(zip).use { out ->
                        val buf = ByteArray(128 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            read += n
                            if (total > 0) {
                                val pct = (read * 100 / total).toInt()
                                if (pct != lastPct) {
                                    lastPct = pct
                                    AssistantBus.emit("AmitAssistantModel", "pct", pct.toString())
                                }
                            }
                        }
                    }
                }
                AssistantBus.emit("AmitAssistantModel", "phase", "unzipping")
                unzip(zip, ctx.filesDir)
                zip.delete()
                if (!AssistantPrefs.modelReady(ctx)) {
                    throw RuntimeException("Model unpacked but folder not found")
                }
                AssistantBus.emit("AmitAssistantModel", "phase", "ready")
                promise.resolve(true)
            } catch (e: Throwable) {
                zip.delete()
                AssistantBus.emit("AmitAssistantModel", "phase", "failed")
                AssistantBus.emit("AmitAssistantError", "message", e.message ?: "Model download failed")
                promise.reject("download_failed", e)
            }
        }.start()
    }

    private fun unzip(zip: File, target: File) {
        ZipInputStream(zip.inputStream().buffered()).use { zis ->
            var entry = zis.nextEntry
            val root = target.canonicalPath + File.separator
            while (entry != null) {
                val out = File(target, entry.name)
                if (!out.canonicalPath.startsWith(root)) throw RuntimeException("bad zip entry")
                if (entry.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    FileOutputStream(out).use { fos -> zis.copyTo(fos) }
                }
                zis.closeEntry()
                entry = zis.nextEntry
            }
        }
    }

    @ReactMethod
    fun deleteModel(promise: Promise) {
        try {
            stopServiceNow()
            AssistantPrefs.modelDir(ctx).deleteRecursively()
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("delete_failed", e)
        }
    }

    /* ------------------------------ listener ------------------------------- */

    @ReactMethod
    fun startWake(promise: Promise) {
        try {
            if (!AssistantPrefs.modelReady(ctx)) {
                promise.reject("no_model", "Download the wake-word model first")
                return
            }
            AssistantPrefs.setWakeEnabled(ctx, true)
            startService(WakeWordService.ACTION_START)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("start_failed", e)
        }
    }

    @ReactMethod
    fun stopWake(promise: Promise) {
        try {
            AssistantPrefs.setWakeEnabled(ctx, false)
            stopServiceNow()
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("stop_failed", e)
        }
    }

    private fun stopServiceNow() {
        try {
            ctx.stopService(Intent(ctx, WakeWordService::class.java))
        } catch (_: Throwable) {
        }
    }

    @ReactMethod
    fun setPolicy(policy: String, promise: Promise) {
        try {
            val ok = policy == AssistantPrefs.POLICY_ALWAYS ||
                policy == AssistantPrefs.POLICY_APP_ONLY ||
                policy == AssistantPrefs.POLICY_CHARGING
            if (!ok) {
                promise.reject("bad_policy", "unknown policy $policy")
                return
            }
            AssistantPrefs.setPolicy(ctx, policy)
            if (WakeWordService.running) startService(WakeWordService.ACTION_RELOAD)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("policy_failed", e)
        }
    }

    /* -------------------------------- bubble ------------------------------- */

    @ReactMethod
    fun showBubble(promise: Promise) {
        if (!canOverlay()) {
            promise.reject("no_overlay", "Overlay permission is not granted")
            return
        }
        try {
            ctx.startService(Intent(ctx, BubbleService::class.java))
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("bubble_failed", e)
        }
    }

    @ReactMethod
    fun hideBubble(promise: Promise) {
        try {
            ctx.stopService(Intent(ctx, BubbleService::class.java))
            AssistantPrefs.setBubbleEnabled(ctx, false)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("bubble_failed", e)
        }
    }

    /* ------------------------------ permissions ---------------------------- */

    private fun canOverlay(): Boolean =
        Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx)

    @ReactMethod
    fun canDrawOverlays(promise: Promise) {
        promise.resolve(canOverlay())
    }

    @ReactMethod
    fun openOverlaySettings(promise: Promise) {
        try {
            val i = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("settings_failed", e)
        }
    }

    private fun ignoringBattery(): Boolean {
        if (Build.VERSION.SDK_INT < 23) return true
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    @ReactMethod
    fun isIgnoringBattery(promise: Promise) = promise.resolve(ignoringBattery())

    @ReactMethod
    fun requestBatteryExemption(promise: Promise) {
        try {
            val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            i.data = Uri.parse("package:${ctx.packageName}")
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("battery_failed", e)
        }
    }

    @ReactMethod
    fun openNotificationSettings(promise: Promise) {
        try {
            val i = if (Build.VERSION.SDK_INT >= 26) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("notif_settings_failed", e)
        }
    }

    /** True exactly once after the app was launched by the wake word/bubble. */
    @ReactMethod
    fun consumeLaunchVoice(promise: Promise) {
        try {
            val a = ctx.currentActivity
            if (a == null) {
                promise.resolve(false)
                return
            }
            val voice = a.intent?.getBooleanExtra("amit_voice", false) ?: false
            if (voice) a.intent?.removeExtra("amit_voice")
            promise.resolve(voice)
        } catch (e: Throwable) {
            promise.resolve(false)
        }
    }

    /**
     * "Share to AmitAI" payload, exactly once.
     *
     * Returns null when there is nothing pending. Images are already copied to
     * the app cache, so the paths stay valid after the sending app is gone.
     */
    @ReactMethod
    fun consumeShare(promise: Promise) {
        try {
            val p = ShareIntake.consume()
            if (p == null) {
                promise.resolve(null)
                return
            }
            val m = Arguments.createMap()
            m.putString("text", p.text)
            val arr = Arguments.createArray()
            p.images.forEach { arr.pushString(it) }
            m.putArray("images", arr)
            m.putDouble("at", p.at.toDouble())
            promise.resolve(m)
        } catch (e: Throwable) {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun openAppSettings(promise: Promise) {        try {
            val i = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("app_settings_failed", e)
        }
    }

    companion object {
        private const val MODEL_URL =
            "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
    }
}
