package com.amit.ai.automation

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject

/**
 * The bridge: JavaScript ←→ AutomationManager.
 *
 * Follows the conventions the other AmitAI modules already use (AmitVoice,
 * AmitAssistant, AmitScheduler): one module per feature, Promise-based, every
 * method guarded, and events pushed through AssistantBus. It does not invent a
 * second event system.
 *
 * Every result is a JSON **string** in the AutomationResult envelope, so the
 * agent gets the same structure it would get from any other tool, and a native
 * crash can never be mistaken for a successful action.
 */
class AmitAutomationModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    init {
        AutomationState.load(ctx)
    }

    override fun getName() = "AmitAutomation"

    private fun reply(promise: Promise, json: String) {
        try {
            promise.resolve(json)
        } catch (e: Throwable) {
            promise.reject("automation_reply", e)
        }
    }

    private fun invalid(action: String, message: String): String =
        AutomationResult.failed(action, message, "invalid_argument").toJsonString()

    private fun submit(promise: Promise, action: AutomationAction) {
        AutomationManager.submit(ctx, action) { json -> reply(promise, json) }
    }

    private fun statusJson(): String {
        val data = AutomationState.stateJson().apply {
            put("permission_enabled", AutomationManager.permissionEnabled(ctx))
            put("service_connected", AmitAccessibilityService.isConnected())
            put("notification_allowed", notificationsAllowed())
            put("foreground_service", AutomationService.running)
            put("idle_ms", AutomationManager.idleMs())
        }
        return AutomationResult
            .success("get_automation_status", "Automation status read.", data)
            .toJsonString()
    }

    private fun notificationsAllowed(): Boolean =
        if (Build.VERSION.SDK_INT >= 33) {
            ctx.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == 0
        } else {
            true
        }

    /* -------------------------------- status -------------------------------- */

    @ReactMethod
    fun status(promise: Promise) = reply(promise, statusJson())

    @ReactMethod
    fun history(promise: Promise) {
        try {
            promise.resolve(AutomationState.historyJson().toString())
        } catch (e: Throwable) {
            promise.reject("history", e)
        }
    }

    @ReactMethod
    fun clearHistory(promise: Promise) {
        try {
            AutomationState.clearHistory(ctx)
            promise.resolve(AutomationState.historyJson().toString())
        } catch (e: Throwable) {
            promise.reject("clear_history", e)
        }
    }

    /* ------------------------------- session -------------------------------- */

    @ReactMethod
    fun setActionMode(enabled: Boolean, promise: Promise) {
        try {
            AutomationState.setEnabled(ctx, enabled)
            if (enabled) {
                // Re-enabling is an explicit human act: it clears a previous
                // emergency stop or safety block. Nothing else does.
                AutomationManager.clearStop(ctx)
            } else {
                AutomationManager.stop(ctx, "Action Mode switched off")
                AutomationService.stop(ctx)
            }
            reply(promise, statusJson())
        } catch (e: Throwable) {
            promise.reject("action_mode", e)
        }
    }

    /**
     * A new agent turn: clears a previous emergency stop so the model may act
     * again, but only because the user just asked for something.
     */
    @ReactMethod
    fun beginSession(promise: Promise) {
        try {
            if (!AutomationState.actionMode) {
                reply(
                    promise,
                    AutomationResult.blocked(
                        "begin_session",
                        "Action Mode is off.",
                        "action_mode_off",
                    ).toJsonString(),
                )
                return
            }
            AutomationManager.clearStop(ctx)
            AutomationManager.beginSession(ctx)
            reply(promise, statusJson())
        } catch (e: Throwable) {
            promise.reject("begin_session", e)
        }
    }

    @ReactMethod
    fun endSession(promise: Promise) {
        try {
            AutomationManager.endSession(ctx)
            reply(promise, statusJson())
        } catch (e: Throwable) {
            promise.reject("end_session", e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            val r = AutomationManager.stop(ctx, "Stopped by the user")
            reply(promise, r.toJsonString())
        } catch (e: Throwable) {
            promise.reject("stop", e)
        }
    }

    /** The user's answer to a confirmation prompt. */
    @ReactMethod
    fun confirm(id: String, approved: Boolean, promise: Promise) {
        try {
            val ok = AutomationManager.answerConfirmation(id, approved)
            val map = Arguments.createMap()
            map.putBoolean("ok", ok)
            map.putBoolean("approved", approved)
            map.putString("id", id)
            promise.resolve(map)
        } catch (e: Throwable) {
            promise.reject("confirm", e)
        }
    }

    /* -------------------------------- tools -------------------------------- */

    private val packageRegex = Regex("^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z0-9_]+)+$")

    @ReactMethod
    fun openApp(packageName: String, uri: String?, promise: Promise) {
        val pkg = packageName.trim()
        if (!packageRegex.matches(pkg)) {
            reply(promise, invalid("open_app", "“$pkg” is not a valid Android package name."))
            return
        }
        if (!uri.isNullOrBlank() && !uri.startsWith("http") && !uri.contains("://")) {
            reply(promise, invalid("open_app", "The deep link must be an absolute URI."))
            return
        }
        submit(promise, AutomationAction.OpenApp(pkg, uri?.takeIf { it.isNotBlank() }))
    }

    @ReactMethod
    fun foregroundApp(promise: Promise) = submit(promise, AutomationAction.GetForegroundApp)

    @ReactMethod
    fun listInstalledApps(query: String?, promise: Promise) {
        val q = query?.trim()?.takeIf { it.isNotEmpty() }
        if (q != null && q.length > 60) {
            reply(promise, invalid("list_installed_apps", "That search text is too long."))
            return
        }
        submit(promise, AutomationAction.ListInstalledApps(q, 400))
    }

    @ReactMethod
    fun screenContent(limit: Double, promise: Promise) {
        val n = limit.toInt().coerceIn(4, 300)
        submit(promise, AutomationAction.GetScreenContent(n))
    }

    @ReactMethod
    fun findElement(text: String?, contentDescription: String?, promise: Promise) {
        val t = text?.trim()?.takeIf { it.isNotEmpty() }
        val d = contentDescription?.trim()?.takeIf { it.isNotEmpty() }
        if (t == null && d == null) {
            reply(promise, invalid("find_element", "Give a text or content_description to look for."))
            return
        }
        if ((t?.length ?: 0) > 200 || (d?.length ?: 0) > 200) {
            reply(promise, invalid("find_element", "That label is too long to be a real element."))
            return
        }
        submit(promise, AutomationAction.FindElement(t, d))
    }

    @ReactMethod
    fun clickableElements(limit: Double, promise: Promise) {
        val n = limit.toInt().coerceIn(1, 120)
        submit(promise, AutomationAction.GetClickableElements(n))
    }

    @ReactMethod
    fun tapElement(text: String?, contentDescription: String?, promise: Promise) {
        val t = text?.trim()?.takeIf { it.isNotEmpty() }
        val d = contentDescription?.trim()?.takeIf { it.isNotEmpty() }
        if (t == null && d == null) {
            reply(promise, invalid("tap_element", "Give a text or content_description to tap."))
            return
        }
        if ((t?.length ?: 0) > 200 || (d?.length ?: 0) > 200) {
            reply(promise, invalid("tap_element", "That label is too long to be a real element."))
            return
        }
        submit(promise, AutomationAction.TapElement(t, d))
    }

    @ReactMethod
    fun typeText(text: String, submit: Boolean, promise: Promise) {
        if (text.isEmpty()) {
            reply(promise, invalid("type_text", "There is no text to type."))
            return
        }
        if (text.length > 1200) {
            reply(
                promise,
                invalid("type_text", "Too much text for one field (${text.length} characters, limit 1200)."),
            )
            return
        }
        submit(promise, AutomationAction.TypeText(text, submit))
    }

    @ReactMethod
    fun scrollScreen(direction: String, promise: Promise) {
        val d = direction.trim().lowercase()
        val allowed = setOf("up", "down", "left", "right", "forward", "backward")
        if (d !in allowed) {
            reply(promise, invalid("scroll_screen", "Direction must be up, down, left or right."))
            return
        }
        submit(promise, AutomationAction.ScrollScreen(d))
    }

    @ReactMethod
    fun pressBack(promise: Promise) = submit(promise, AutomationAction.PressBack)

    @ReactMethod
    fun requestUserConfirmation(description: String, timeoutMs: Double, promise: Promise) {
        val d = description.trim()
        if (d.length < 4) {
            reply(
                promise,
                invalid(
                    "request_user_confirmation",
                    "Say what the user is approving, e.g. “send the message to Riya”.",
                ),
            )
            return
        }
        val timeout = if (timeoutMs <= 0) {
            AutomationManager.CONFIRM_TIMEOUT_DEFAULT
        } else {
            timeoutMs.toLong()
        }
        submit(promise, AutomationAction.RequestConfirmation(d.take(240), timeout))
    }

    /* ------------------------------ permissions ----------------------------- */

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        try {
            val i = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
            promise.resolve(true)
        } catch (e: Throwable) {
            // Some OEMs hide the top-level screen; fall back to app details.
            try {
                val i = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                i.data = Uri.parse("package:${ctx.packageName}")
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(i)
                promise.resolve(true)
            } catch (e2: Throwable) {
                promise.reject("accessibility_settings", e2)
            }
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
            promise.reject("notification_settings", e)
        }
    }

    /** Used by the Settings UI to show "enabled but not bound" honestly. */
    @ReactMethod
    fun permission(promise: Promise) {
        try {
            val map = Arguments.createMap()
            map.putBoolean("enabled", AutomationManager.permissionEnabled(ctx))
            map.putBoolean("connected", AmitAccessibilityService.isConnected())
            map.putBoolean("action_mode", AutomationState.actionMode)
            map.putBoolean("notifications", notificationsAllowed())
            promise.resolve(map)
        } catch (e: Throwable) {
            promise.reject("permission", e)
        }
    }

    /** Small helper for the JS status strip: no tree read, no IPC. */
    @ReactMethod
    fun stateJson(promise: Promise) {
        try {
            promise.resolve(AutomationState.stateJson().put("permission_enabled", AutomationManager.permissionEnabled(ctx)).toString())
        } catch (e: Throwable) {
            promise.reject("state", e)
        }
    }

    companion object {
        fun contextOf(ctx: Context): Context = ctx.applicationContext
    }
}
