package com.amit.ai

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import kotlin.math.abs

/**
 * Draggable floating "A" bubble. Tap → open AmitAI in voice mode.
 * Overlay permission is requested from Settings; without it the service stops.
 */
class BubbleService : Service() {

    private var wm: WindowManager? = null
    private var view: View? = null
    private var params: WindowManager.LayoutParams? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }
        show()
        AssistantPrefs.setBubbleEnabled(this, true)
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun show() {
        val manager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        wm = manager
        val size = dp(56)

        val tv = TextView(this).apply {
            text = "A"
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            textSize = 22f
            typeface = Typeface.DEFAULT_BOLD
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(0xFF7C4DFF.toInt(), 0xFF00BFA6.toInt())
            ).apply { shape = GradientDrawable.OVAL }
            elevation = dp(6).toFloat()
        }

        val p = WindowManager.LayoutParams(
            size, size,
            if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = resources.displayMetrics.widthPixels - size - dp(12)
            y = resources.displayMetrics.heightPixels / 2
        }
        params = p

        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var dragging = false

        tv.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY
                    startX = p.x; startY = p.y
                    dragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (e.rawX - downX).toInt()
                    val dy = (e.rawY - downY).toInt()
                    if (abs(dx) > dp(6) || abs(dy) > dp(6)) dragging = true
                    if (dragging) {
                        p.x = startX + dx
                        p.y = startY + dy
                        try { wm?.updateViewLayout(tv, p) } catch (_: Throwable) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!dragging) openVoice()
                    true
                }
                else -> false
            }
        }

        try {
            manager.addView(tv, p)
            view = tv
        } catch (e: Throwable) {
            AssistantBus.emit("AmitAssistantError", "message", "Bubble failed: ${e.message}")
            stopSelf()
        }
        AssistantBus.emit("AmitAssistantState", "bubble", "true")
    }

    private fun openVoice() {
        try {
            startActivity(
                Intent(this, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    putExtra("amit_voice", true)
                }
            )
        } catch (_: Throwable) {
        }
    }

    override fun onDestroy() {
        try {
            view?.let { wm?.removeView(it) }
        } catch (_: Throwable) {
        }
        view = null
        AssistantPrefs.setBubbleEnabled(this, false)
        AssistantBus.emit("AmitAssistantState", "bubble", "false")
        super.onDestroy()
    }
}
