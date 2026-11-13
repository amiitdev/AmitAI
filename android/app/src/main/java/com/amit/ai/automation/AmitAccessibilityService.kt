package com.amit.ai.automation

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * The one accessibility service in this app.
 *
 * Android owns its lifecycle: the user enables it in
 * Settings → Accessibility → AmitAI, the system binds it, and it stays bound
 * across app restarts. If the user turns it off, onUnbind/onDestroy fires and
 * every automation tool starts returning `permission_missing` instead of
 * pretending to work.
 *
 * The service does very little itself on purpose. It tracks the foreground
 * package, keeps a screen-changed clock for the observe → act → verify loop,
 * runs the safety check when the window changes, and hands everything else to
 * AutomationManager. No action is ever performed from inside an event callback.
 */
class AmitAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        private var instance: AmitAccessibilityService? = null

        /** True only while the system has this service bound — not just "enabled". */
        fun isConnected(): Boolean = instance != null

        fun current(): AmitAccessibilityService? = instance
    }

    /** Throttle policy screen checks: window changes can arrive in bursts. */
    private var lastPolicyCheckAt = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        AutomationState.load(this)
        AutomationState.serviceConnected = true
        AutomationManager.onServiceConnected(this)
        AutomationState.emitState()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val e = event ?: return
        val pkg = e.packageName?.toString() ?: ""
        val now = System.currentTimeMillis()

        AutomationState.lastEventAt = now
        if (pkg.isNotBlank()) AutomationState.lastEventPackage = pkg

        when (e.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                AutomationState.contentVersion++
                AutomationManager.onWindowChanged(this, pkg, e.className?.toString() ?: "")
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_SCROLLED,
            AccessibilityEvent.TYPE_VIEW_CLICKED,
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED,
            -> AutomationState.contentVersion++
            else -> {}
        }

        // A sensitive screen must stop automation even if nobody asked for it.
        if (AutomationState.sessionActive &&
            (e.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
                e.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) &&
            now - lastPolicyCheckAt > 600
        ) {
            lastPolicyCheckAt = now
            AutomationManager.checkScreenSafety(this, pkg)
        }
    }

    override fun onInterrupt() {
        AutomationState.emitState()
    }

    override fun onUnbind(intent: Intent?): Boolean {
        teardown()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        teardown()
        super.onDestroy()
    }

    private fun teardown() {
        if (instance === this) instance = null
        AutomationState.serviceConnected = false
        AutomationState.endSession("Accessibility service was turned off")
        AutomationService.stop(this)
        AutomationState.emitState()
    }

    /** Read the current root without keeping it — used by the manager only. */
    fun activeRoot(): AccessibilityNodeInfo? = rootInActiveWindow
}
