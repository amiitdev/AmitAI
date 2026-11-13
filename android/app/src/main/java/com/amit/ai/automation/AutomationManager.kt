package com.amit.ai.automation

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Path
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * The automation engine: intents first, accessibility tree second, gestures last.
 *
 * Execution model
 * ---------------
 * All actions run on ONE worker thread. That is deliberate: an agent that asks
 * for a tap and a scroll in the same millisecond must not race the UI, and the
 * observe → act → verify loop only makes sense if actions are serialized.
 * The React Native module never blocks its own thread — it submits here and
 * resolves the promise from the worker.
 *
 * Every action follows the same shape:
 *
 *   1. preflight      — Action Mode on? service bound? session budget left?
 *   2. read           — capture the screen (structured, no pixels)
 *   3. policy         — sensitive screen? destructive tap needing a yes?
 *   4. act            — intent / node action / gesture
 *   5. wait for idle  — up to ~2.6 s for the app to settle
 *   6. verify         — compare the screen fingerprint before/after
 *   7. record         — history + counters + event to JS
 *
 * If step 6 shows the screen did not change, the result is `failed`, never
 * `success`. If the same miss happens three times in a row the session is
 * blocked: the model must re-read the screen or ask the user instead of
 * tapping blindly.
 */
object AutomationManager {

    private const val TAG = "AmitAutomation"

    const val TIMEOUT_OPEN_APP = 15_000L
    const val TIMEOUT_ACTION = 12_000L
    const val TIMEOUT_READ = 8_000L
    const val CONFIRM_TIMEOUT_DEFAULT = 90_000L
    private const val CONFIRM_TIMEOUT_MIN = 10_000L
    private const val CONFIRM_TIMEOUT_MAX = 180_000L

    private val worker = Executors.newSingleThreadExecutor { r ->
        Thread(r, "amit-automation").apply {
            isDaemon = true
            priority = Thread.NORM_PRIORITY
        }
    }

    /** Safety checks run off the event thread: reading a tree is IPC work. */
    private val safety = Executors.newSingleThreadExecutor { r ->
        Thread(r, "amit-automation-safety").apply { isDaemon = true }
    }

    @Volatile private var cancelRequested = false
    @Volatile private var lastActionAt = 0L

    private val confirmLock = Object()
    private var confirmAnswer: Boolean? = null
    private var confirmId: String? = null

    /** Thrown when the user hits stop while an action is waiting. */
    private class Stopped : Exception()

    /* ------------------------------- plumbing ------------------------------ */

    /** Queue an action; the JSON result is handed back on the worker thread. */
    fun submit(ctx: Context, action: AutomationAction, reply: (String) -> Unit) {
        worker.execute {
            val result = try {
                run(ctx, action)
            } catch (_: Stopped) {
                AutomationResult.cancelled(action.name, "Stopped by the user before the action finished.")
            } catch (t: Throwable) {
                Log.e(TAG, "action ${action.name} failed", t)
                AutomationResult.failed(
                    action.name,
                    "Native failure: ${t.javaClass.simpleName}: ${t.message ?: "no detail"}",
                    "native_error",
                )
            }
            try {
                reply(result.toJsonString())
            } catch (_: Throwable) {
            }
        }
    }

    private fun run(ctx: Context, action: AutomationAction): AutomationResult {
        val started = System.currentTimeMillis()

        // These three must work even without the accessibility service, so the
        // agent can always ask "why not" and the UI can always stop.
        when (action) {
            is AutomationAction.GetStatus -> return statusResult(ctx, started)
            is AutomationAction.Stop -> return stop(ctx, "Stopped by the agent")
            is AutomationAction.RequestConfirmation -> return requestConfirmation(ctx, action, started)
            else -> {}
        }

        if (cancelRequested) {
            return AutomationResult.cancelled(
                action.name,
                "This Action Mode session was stopped. Ask the user before doing anything else.",
            )
        }
        if (!AutomationState.actionMode) {
            return AutomationResult.blocked(
                action.name,
                "Action Mode is off. Turn it on in AmitAI › Action Mode before trying to control the phone.",
                "action_mode_off",
            )
        }
        val service = AmitAccessibilityService.current()
            ?: return AutomationResult.blocked(
                action.name,
                "AmitAI's accessibility service is not running. Enable it in Android Settings › " +
                    "Accessibility › AmitAI. Until then no app can be read or tapped.",
                "permission_missing",
            )

        if (!AutomationState.sessionActive) startSession(ctx)

        AutomationState.status = AutomationState.STATUS_RUNNING
        AutomationState.currentAction = describeAction(action)
        AutomationState.emitState()

        val result = when (action) {
            is AutomationAction.OpenApp -> openApp(ctx, service, action, started)
            is AutomationAction.GetForegroundApp -> foregroundResult(ctx, service, started)
            is AutomationAction.ListInstalledApps -> installedApps(ctx, action, started)
            is AutomationAction.GetScreenContent -> screenContent(ctx, service, action, started)
            is AutomationAction.FindElement -> findElement(ctx, service, action, started)
            is AutomationAction.GetClickableElements -> clickableResult(ctx, service, action, started)
            is AutomationAction.TapElement -> tapElement(ctx, service, action, started)
            is AutomationAction.TypeText -> typeText(ctx, service, action, started)
            is AutomationAction.ScrollScreen -> scrollScreen(ctx, service, action, started)
            is AutomationAction.PressBack -> pressBack(ctx, service, started)
            // Handled before the preflight above.
            else -> AutomationResult.failed(action.name, "Unsupported action", "unsupported_action")
        }

        return finish(ctx, result)
    }

    /** Bookkeeping every real action shares: history, counters, budget, event. */
    private fun finish(ctx: Context, result: AutomationResult): AutomationResult {
        if (AutomationState.sessionActive) {
            AutomationState.steps++
            lastActionAt = System.currentTimeMillis()
        }
        AutomationState.record(result)
        AutomationState.persistHistory(ctx)
        AutomationEvents.action(result)

        if (AutomationState.sessionActive) {
            if (AutomationState.consecutiveFailures >= AutomationState.MAX_CONSECUTIVE_FAILURES) {
                blockSession(
                    ctx,
                    "Three actions in a row did not change the screen as expected. Automation paused — " +
                        "read the screen again or ask the user.",
                )
            } else if (AutomationState.steps >= AutomationState.MAX_STEPS) {
                blockSession(
                    ctx,
                    "Step budget for this session is used up (${AutomationState.MAX_STEPS} actions). " +
                        "Ask the user to continue.",
                )
            } else {
                AutomationState.status = AutomationState.STATUS_IDLE
                AutomationState.emitState()
            }
        }
        return result
    }

    private fun startSession(ctx: Context) {
        AutomationState.beginSession()
        cancelRequested = false
        lastActionAt = System.currentTimeMillis()
        AutomationService.start(ctx)
        AutomationState.emitState()
    }

    fun beginSession(ctx: Context) {
        startSession(ctx)
    }

    fun endSession(ctx: Context) {
        if (AutomationState.sessionActive) {
            AutomationState.endSession()
            AutomationState.persistHistory(ctx)
        }
        AutomationService.stop(ctx)
    }

    /**
     * Emergency stop. Called from the UI, the notification and the tool — it
     * must never wait behind the action it is trying to cancel, so it does not
     * go through the worker queue.
     */
    fun stop(ctx: Context, reason: String): AutomationResult {
        val result = stopNow(ctx, reason)
        AutomationState.record(result, count = false)
        AutomationState.persistHistory(ctx)
        AutomationEvents.action(result)
        return result
    }

    private fun stopNow(ctx: Context, reason: String): AutomationResult {
        cancelRequested = true
        answerConfirmationInternal(null)
        AutomationState.sessionActive = false
        AutomationState.status = AutomationState.STATUS_STOPPED
        AutomationState.currentAction = ""
        AutomationState.blockedReason = reason
        AutomationState.emitState()
        AutomationService.stop(ctx)
        return AutomationResult.success(
            "stop_automation",
            "Automation stopped. No further taps will be sent until the user starts it again.",
            JSONObject().put("stopped", true).put("reason", reason),
            durationMs = 0,
        )
    }

    /** Milliseconds since the last action, or -1 when nothing has run yet. */
    fun idleMs(): Long = if (lastActionAt == 0L) -1 else System.currentTimeMillis() - lastActionAt

    fun clearStop(ctx: Context) {        cancelRequested = false
        AutomationState.resetStop()
        AutomationState.persistHistory(ctx)
        AutomationState.emitState()
    }

    /* -------------------------------- status ------------------------------- */

    fun permissionEnabled(ctx: Context): Boolean {
        return try {
            val flat = Settings.Secure.getString(
                ctx.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            ) ?: return false
            val enabled = Settings.Secure.getInt(
                ctx.contentResolver,
                Settings.Secure.ACCESSIBILITY_ENABLED,
                0,
            ) == 1
            if (!enabled) return false
            val wanted = "${ctx.packageName}/${AmitAccessibilityService::class.java.name}"
            flat.split(':').any { it.equals(wanted, ignoreCase = true) }
        } catch (_: Throwable) {
            false
        }
    }

    private fun statusResult(ctx: Context, started: Long): AutomationResult {
        val data = AutomationState.stateJson().apply {
            put("permission_enabled", permissionEnabled(ctx))
            put("service_connected", AmitAccessibilityService.isConnected())
            put("idle_ms", if (lastActionAt == 0L) -1 else System.currentTimeMillis() - lastActionAt)
            val h = AutomationState.historyJson()
            val recent = JSONArray()
            for (i in 0 until minOf(10, h.length())) recent.put(h.getJSONObject(i))
            put("history", recent)
            put(
                "hint",
                when {
                    !permissionEnabled(ctx) ->
                        "Accessibility is off. Open Android Settings › Accessibility › AmitAI and enable it."
                    !AmitAccessibilityService.isConnected() ->
                        "Accessibility is enabled but the service is not bound yet. Reopen the setting once."
                    !AutomationState.actionMode -> "Action Mode is off in AmitAI."
                    else -> "Ready."
                },
            )
        }
        return AutomationResult.success(
            "get_automation_status",
            "Automation status read.",
            data,
            durationMs = System.currentTimeMillis() - started,
        )
    }

    /* ------------------------------ confirmation ---------------------------- */

    private fun requestConfirmation(
        ctx: Context,
        action: AutomationAction.RequestConfirmation,
        started: Long,
    ): AutomationResult {
        if (!AutomationState.actionMode) {
            return AutomationResult.blocked(
                action.name,
                "Action Mode is off, so there is nothing to confirm.",
                "action_mode_off",
            )
        }
        val description = action.description.trim()
        if (description.isEmpty()) {
            return AutomationResult.failed(
                action.name,
                "A confirmation needs a description of the action.",
                "invalid_argument",
            )
        }
        val timeout = action.timeoutMs.coerceIn(CONFIRM_TIMEOUT_MIN, CONFIRM_TIMEOUT_MAX)
        val id = "cf_" + UUID.randomUUID().toString().take(8)

        synchronized(confirmLock) {
            confirmAnswer = null
            confirmId = id
        }
        AutomationState.pendingConfirmId = id
        AutomationState.pendingConfirmText = description
        AutomationState.status = AutomationState.STATUS_AWAITING_CONFIRMATION
        AutomationState.emitState()
        AutomationEvents.confirm(id, description, timeout)

        val deadline = System.currentTimeMillis() + timeout
        var answer: Boolean? = null
        synchronized(confirmLock) {
            while (confirmAnswer == null && !cancelRequested) {
                val left = deadline - System.currentTimeMillis()
                if (left <= 0) break
                try {
                    confirmLock.wait(minOf(left, 250L))
                } catch (_: InterruptedException) {
                    break
                }
            }
            answer = confirmAnswer
            confirmAnswer = null
            confirmId = null
        }
        AutomationState.pendingConfirmId = null
        AutomationState.pendingConfirmText = ""
        AutomationState.status = AutomationState.STATUS_IDLE
        AutomationState.emitState()

        val elapsed = System.currentTimeMillis() - started
        val data = JSONObject().put("approved", answer == true).put("id", id)
        return when {
            answer == true -> {
                AutomationPolicy.grantConfirmation()
                AutomationResult.success(
                    action.name,
                    "The user approved: $description",
                    data,
                    durationMs = elapsed,
                )
            }
            answer == false -> AutomationResult.failed(
                action.name,
                "The user declined: $description. Do not perform that action; ask what they want instead.",
                "user_denied",
                data,
                elapsed,
            )
            cancelRequested -> AutomationResult.cancelled(
                action.name,
                "The session was stopped while waiting for the user.",
                elapsed,
            )
            else -> AutomationResult.timeout(
                action.name,
                "The user did not answer within ${timeout / 1000} s. Do not assume approval.",
                "confirmation_timeout",
                data,
                elapsed,
            )
        }
    }

    /** Called by the UI and by the tool's own cancel path. */
    fun answerConfirmation(id: String, approved: Boolean): Boolean {
        synchronized(confirmLock) {
            if (confirmId == null || confirmId != id) return false
            confirmAnswer = approved
            confirmLock.notifyAll()
            return true
        }
    }

    private fun answerConfirmationInternal(approved: Boolean?) {
        synchronized(confirmLock) {
            if (confirmId == null) return
            confirmAnswer = approved
            confirmLock.notifyAll()
        }
    }

    /* -------------------------------- actions ------------------------------ */

    private fun openApp(
        ctx: Context,
        service: AmitAccessibilityService,
        action: AutomationAction.OpenApp,
        started: Long,
    ): AutomationResult {
        val pkg = action.packageName.trim()
        val pm = ctx.packageManager
        val label = appLabel(ctx, pkg)

        val launch = pm.getLaunchIntentForPackage(pkg)
        if (launch == null) {
            return AutomationResult.failed(
                action.name,
                "“$pkg” is not installed (or has no launcher activity). Use list_installed_apps to see " +
                    "what is actually on this phone.",
                "app_not_installed",
                JSONObject().put("package", pkg),
                System.currentTimeMillis() - started,
            )
        }

        var mode = "launcher_intent"
        var usedUri = ""
        var launched = false
        if (!action.uri.isNullOrBlank()) {
            val deep = Intent(Intent.ACTION_VIEW, Uri.parse(action.uri))
                .setPackage(pkg)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                ctx.startActivity(deep)
                launched = true
                mode = "deep_link"
                usedUri = action.uri
            } catch (_: Throwable) {
                // The app does not handle that link — fall through to its launcher.
            }
        }
        if (!launched) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                ctx.startActivity(launch)
            } catch (t: Throwable) {
                return AutomationResult.failed(
                    action.name,
                    "Android refused to start $pkg: ${t.message ?: t.javaClass.simpleName}",
                    "launch_failed",
                    JSONObject().put("package", pkg),
                    System.currentTimeMillis() - started,
                )
            }
        }

        val opened = waitForPackage(service, pkg, TIMEOUT_OPEN_APP)
        val elapsed = System.currentTimeMillis() - started
        if (!opened) {
            val seen = foregroundPackage(service)
            return AutomationResult.timeout(
                action.name,
                "Asked Android to open $label, but the foreground app is still " +
                    "“${seen.ifBlank { "unknown" }}” after ${TIMEOUT_OPEN_APP / 1000} s. " +
                    "It may be showing a splash, a login screen, or it may be blocked by the system.",
                "app_did_not_open",
                JSONObject()
                    .put("package", pkg)
                    .put("app", label)
                    .put("foreground", seen),
                elapsed,
            )
        }

        waitForIdle(service, 450, 5_000)
        val tree = readTree(service)
        val snapshot = tree?.let { snapshot(ctx, it) }
        val data = JSONObject()
            .put("package", pkg)
            .put("app", label)
            .put("mode", mode)
            .put("uri", usedUri)
            .put("readable", tree != null)
            .put("screen", snapshot?.toJson() ?: JSONObject.NULL)
        return AutomationResult.success(
            action.name,
            "$label is in the foreground." + if (tree == null) " The window is not readable (secure screen?), so read nothing from it." else "",
            data,
            changed = true,
            durationMs = elapsed,
        )
    }

    private fun foregroundResult(
        ctx: Context,
        service: AmitAccessibilityService,
        started: Long,
    ): AutomationResult {
        val pkg = foregroundPackage(service)
        val tree = readTree(service)
        val readable = tree != null
        val label = if (pkg.isBlank()) "" else appLabel(ctx, pkg)
        val texts = tree?.nodes?.map { it.label }?.filter { it.isNotBlank() }?.take(80) ?: emptyList()
        val sensitive = AutomationPolicy.screenSensitivity(
            tree?.packageName ?: pkg,
            texts,
            tree?.hasPassword ?: false,
        )
        val data = JSONObject()
            .put("package", pkg)
            .put("app", label.ifBlank { pkg })
            .put("readable", readable)
            .put("window_title", tree?.windowTitle ?: "")
            .put("sensitive", sensitive ?: JSONObject.NULL)
            .put("last_event_ms", AutomationState.lastEventAt)
        return AutomationResult.success(
            "get_foreground_app",
            if (pkg.isBlank()) "No foreground app could be determined."
            else "The foreground app is ${label.ifBlank { pkg }}.",
            data,
            durationMs = System.currentTimeMillis() - started,
        )
    }

    private fun installedApps(
        ctx: Context,
        action: AutomationAction.ListInstalledApps,
        started: Long,
    ): AutomationResult {
        val pm = ctx.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val infos = try {
            if (Build.VERSION.SDK_INT >= 33) {
                pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                pm.queryIntentActivities(intent, 0)
            }
        } catch (t: Throwable) {
            return AutomationResult.failed(
                action.name,
                "Android blocked the app list query: ${t.message ?: t.javaClass.simpleName}",
                "list_failed",
            )
        }
        val needle = action.query?.trim()?.lowercase(Locale.ROOT)?.takeIf { it.isNotEmpty() }
        val apps = LinkedHashMap<String, JSONObject>()
        for (info in infos) {
            val activity = info.activityInfo ?: continue
            val pkg = activity.packageName ?: continue
            if (apps.containsKey(pkg)) continue
            val label = activity.applicationInfo?.loadLabel(pm)?.toString() ?: pkg
            if (needle != null && !label.lowercase(Locale.ROOT).contains(needle) &&
                !pkg.lowercase(Locale.ROOT).contains(needle)
            ) continue
            apps[pkg] = JSONObject()
                .put("package", pkg)
                .put("app", label)
                .put("self", pkg == ctx.packageName)
            if (apps.size >= action.limit) break
        }
        val arr = JSONArray()
        apps.values.sortedBy { it.optString("app").lowercase(Locale.ROOT) }.forEach { arr.put(it) }
        return AutomationResult.success(
            action.name,
            "${arr.length()} launchable app${if (arr.length() == 1) "" else "s"} found.",
            JSONObject().put("apps", arr).put("count", arr.length())
                .put("truncated", arr.length() >= action.limit),
            durationMs = System.currentTimeMillis() - started,
        )
    }

    private fun screenContent(
        ctx: Context,
        service: AmitAccessibilityService,
        action: AutomationAction.GetScreenContent,
        started: Long,
    ): AutomationResult {
        val tree = readTree(service)
            ?: return unreadable(action.name, started)
        val snap = snapshot(ctx, tree)
        snap.sensitive?.let { return sensitiveBlocked(action.name, it, started) }

        val elements = JSONArray()
        AccessibilityNodeHelper.appendTexts(tree.nodes, elements)
        val interactive = JSONArray()
        tree.nodes.filter { it.clickable || it.editable || it.scrollable }
            .sortedWith(compareBy({ it.bounds.top }, { it.bounds.left }))
            .take(action.limit)
            .forEach { interactive.put(it.toJson()) }

        val data = JSONObject()
            .put("package", tree.packageName)
            .put("app", snap.appLabel)
            .put("window_title", tree.windowTitle)
            .put("digest", tree.digest)
            .put("node_count", tree.nodeCount)
            .put("visible_nodes", tree.nodes.size)
            .put("clickable_count", snap.clickableCount)
            .put("editable_count", snap.editableCount)
            .put("elements", elements)
            .put("interactive", interactive)

        return AutomationResult.success(
            action.name,
            "Read ${tree.nodes.size} visible elements from ${snap.appLabel.ifBlank { tree.packageName }}. " +
                "Act on one of them by text or content description; do not guess coordinates.",
            data,
            durationMs = System.currentTimeMillis() - started,
        )
    }

    private fun findElement(
        ctx: Context,
        service: AmitAccessibilityService,
        action: AutomationAction.FindElement,
        started: Long,
    ): AutomationResult {
        val text = action.text?.trim().orEmpty()
        val desc = action.contentDescription?.trim().orEmpty()
        if (text.isEmpty() && desc.isEmpty()) {
            return AutomationResult.failed(
                action.name,
                "Give a text or content_description to look for.",
                "invalid_argument",
            )
        }
        val tree = readTree(service) ?: return unreadable(action.name, started)
        val snap = snapshot(ctx, tree)
        snap.sensitive?.let { return sensitiveBlocked(action.name, it, started) }

        val matches = matchNodes(tree, text, desc, 8)
        val elapsed = System.currentTimeMillis() - started
        if (matches.isEmpty()) {
            val nearby = JSONArray()
            AccessibilityNodeHelper.clickables(tree, 12).forEach {
                if (it.label.isNotBlank()) nearby.put(it.label)
            }
            return AutomationResult.failed(
                action.name,
                "Nothing on this screen matched “${text.ifEmpty { desc }}”. " +
                    "Do NOT tap blindly — read the screen again or use one of the visible labels.",
                "element_not_found",
                JSONObject()
                    .put("query", text.ifEmpty { desc })
                    .put("package", tree.packageName)
                    .put("digest", tree.digest)
                    .put("nearby_clickables", nearby),
                elapsed,
            )
        }
        val arr = JSONArray()
        matches.forEach { arr.put(it.toJson()) }
        return AutomationResult.success(
            action.name,
            "${matches.size} element${if (matches.size == 1) "" else "s"} matched.",
            JSONObject()
                .put("package", tree.packageName)
                .put("digest", tree.digest)
                .put("matches", arr)
                .put("tap_with", JSONObject()
                    .put("text", matches.first().label)
                    .put("content_description", matches.first().description)),
            durationMs = elapsed,
        )
    }

    private fun clickableResult(
        ctx: Context,
        service: AmitAccessibilityService,
        action: AutomationAction.GetClickableElements,
        started: Long,
    ): AutomationResult {
        val tree = readTree(service) ?: return unreadable(action.name, started)
        val snap = snapshot(ctx, tree)
        snap.sensitive?.let { return sensitiveBlocked(action.name, it, started) }
        val items = AccessibilityNodeHelper.clickables(tree, action.limit)
        val arr = JSONArray()
        items.forEachIndexed { i, n ->
            arr.put(n.toJson().put("index", i + 1))
        }
        return AutomationResult.success(
            action.name,
            "${items.size} clickable element${if (items.size == 1) "" else "s"} on screen.",
            JSONObject()
                .put("package", tree.packageName)
                .put("digest", tree.digest)
                .put("elements", arr),
            durationMs = System.currentTimeMillis() - started,
        )
    }

    private fun tapElement(
        ctx: Context,
        service: AmitAccessibilityService,
        action: AutomationAction.TapElement,
        started: Long,
    ): AutomationResult {
        val text = action.text?.trim().orEmpty()
        val desc = action.contentDescription?.trim().orEmpty()
        if (text.isEmpty() && desc.isEmpty()) {
            return AutomationResult.failed(
                action.name,
                "Give a text or content_description of the element to tap.",
                "invalid_argument",
            )
        }
        val tree = readTree(service) ?: return unreadable(action.name, started)
        val snap = snapshot(ctx, tree)
        snap.sensitive?.let { return sensitiveBlocked(action.name, it, started) }
        val before = tree.digest

        // Refuse a fuzzy tap. "Search" must not silently become "Voice search":
        // a match that is not exact, not a prefix, and not the only candidate is
        // ambiguous, and guessing is how an agent taps the wrong thing.
        val candidates = matchNodes(tree, text, desc, 8)
        val tq = AccessibilityNodeHelper.norm(text)
        val dq = AccessibilityNodeHelper.norm(desc)
        val top = candidates.firstOrNull()
        val strong = top != null && (
            (tq.isNotEmpty() && (AccessibilityNodeHelper.norm(top.text) == tq ||
                AccessibilityNodeHelper.norm(top.text).startsWith(tq))) ||
                (dq.isNotEmpty() && (AccessibilityNodeHelper.norm(top.description) == dq ||
                    AccessibilityNodeHelper.norm(top.description).startsWith(dq)))
            )
        if (top != null && !strong && candidates.size > 1) {
            val list = JSONArray()
            candidates.take(6).forEach { c ->
                list.put(
                    JSONObject().put("text", c.label).put("content_description", c.description)
                        .put("clickable", c.clickable),
                )
            }
            return AutomationResult.failed(
                action.name,
                "“${text.ifEmpty { desc }}” is ambiguous on this screen — it is not an exact label and " +
                    "${candidates.size} elements are close. Pick one of the candidates and use its exact label.",
                "ambiguous_match",
                JSONObject().put("candidates", list),
                System.currentTimeMillis() - started,
            )
        }

        var label = text.ifEmpty { desc }
        var element: JSONObject? = null
        var refusal: String? = null
        var risky: String? = null
        var tapped: Boolean? = null

        AccessibilityNodeHelper.withNode(
            service,
            top?.text?.ifBlank { null },
            top?.description?.ifBlank { null },
            true,
        ) { node ->
            val nodeLabel = AccessibilityNodeHelper.text(node)
                .ifBlank { node.contentDescription?.toString() ?: "" }
            label = nodeLabel.ifBlank { label }
            element = AccessibilityNodeHelper.describe(node)

            val ris = AutomationPolicy.riskyKeyword(nodeLabel)
            when {
                node.isPassword -> {
                    refusal = "That element is a password field. Automation is not allowed to touch it."
                    false
                }
                ris != null && !AutomationPolicy.confirmationFresh() -> {
                    risky = ris
                    false
                }
                else -> {
                    if (ris != null) AutomationPolicy.consumeConfirmation()
                    tapped = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    tapped == true
                }
            }
        }

        val elapsed = System.currentTimeMillis() - started
        if (refusal != null) {
            return AutomationResult.blocked(action.name, refusal!!, "sensitive_element", null, elapsed)
        }
        if (risky != null) {
            return AutomationResult.blocked(
                action.name,
                "“$label” is a destructive or irreversible action (matched “$risky”). " +
                    "Call request_user_confirmation first and wait for a yes.",
                "confirmation_required",
                JSONObject().put("element", label).put("matched", risky),
                elapsed,
            )
        }
        if (tapped == null) {
            val nearby = JSONArray()
            AccessibilityNodeHelper.clickables(tree, 12).forEach {
                if (it.label.isNotBlank()) nearby.put(it.label)
            }
            return AutomationResult.failed(
                action.name,
                "No clickable element matched “${text.ifEmpty { desc }}”. Read the screen again — " +
                    "the label may have changed.",
                "element_not_found",
                JSONObject().put("digest", before).put("nearby_clickables", nearby),
                elapsed,
            )
        }
        if (tapped == false) {
            return AutomationResult.failed(
                action.name,
                "Android refused the click on “$label” (disabled, covered, or not clickable).",
                "click_refused",
                JSONObject().put("element", element ?: JSONObject.NULL),
                elapsed,
            )
        }

        waitForIdle(service, 350, 2_600)
        val afterTree = readTree(service)
        val afterSnap = afterTree?.let { snapshot(ctx, it) }
        val changed = afterTree == null || afterTree.digest != before
        val data = JSONObject()
            .put("element", element ?: JSONObject.NULL)
            .put("package", afterTree?.packageName ?: tree.packageName)
            .put("app", afterSnap?.appLabel ?: snap.appLabel)
            .put("digest_before", before)
            .put("digest_after", afterTree?.digest ?: "")
            .put("screen", afterSnap?.toJson() ?: JSONObject.NULL)
            .put("clickable_after", afterSnap?.clickableCount ?: 0)

        return if (changed) {
            AutomationResult.success(
                action.name,
                "Tapped “$label” and the screen changed. Read the new screen before the next step.",
                data,
                changed = true,
                durationMs = System.currentTimeMillis() - started,
            )
        } else {
            // The click was accepted but nothing moved: do not call that success,
            // or the model will happily continue on a screen it never reached.
            AutomationResult.failed(
                action.name,
                "The click on “$label” was accepted but the screen did not change. It may have missed, " +
                    "the button may already have been active, or the content is not what you assumed.",
                "no_visible_change",
                data,
                System.currentTimeMillis() - started,
            )
        }
    }

    private fun typeText(
        ctx: Context,
        service: AmitAccessibilityService,
        action: AutomationAction.TypeText,
        started: Long,
    ): AutomationResult {
        val text = action.text
        if (text.isEmpty()) {
            return AutomationResult.failed(action.name, "There is no text to type.", "invalid_argument")
        }
        if (text.length > 1200) {
            return AutomationResult.failed(
                action.name,
                "That is too much text for one field (${text.length} characters, limit 1200).",
                "invalid_argument",
            )
        }
        val tree = readTree(service) ?: return unreadable(action.name, started)
        val snap = snapshot(ctx, tree)
        snap.sensitive?.let { return sensitiveBlocked(action.name, it, started) }
        if (tree.hasPassword) {
            return AutomationResult.blocked(
                action.name,
                "There is a password field on this screen. AmitAI never types into or reads password fields.",
                "sensitive_screen",
            )
        }

        var typed: Boolean? = null
        var refusal: String? = null
        var seen = ""
        val editable = AccessibilityNodeHelper.withEditableNode(service) { node ->
            if (node.isPassword) {
                refusal = "That field is a password field."
                false
            } else {
                node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                val args = Bundle().apply {
                    putCharSequence(
                        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                        text,
                    )
                }
                val ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                typed = ok
                seen = AccessibilityNodeHelper.text(node)
                ok
            }
        }

        val elapsed = System.currentTimeMillis() - started
        if (refusal != null) {
            return AutomationResult.blocked(action.name, refusal!!, "sensitive_element", null, elapsed)
        }
        if (editable == null) {
            val fields = JSONArray()
            AccessibilityNodeHelper.editableNodes(tree).forEach { fields.put(it.toJson()) }
            return AutomationResult.failed(
                action.name,
                "No text field is focused or present. Tap the search box or input field first, then type.",
                "no_input_field",
                JSONObject().put("fields", fields),
                elapsed,
            )
        }
        if (typed != true) {
            return AutomationResult.failed(
                action.name,
                "Android refused ACTION_SET_TEXT on that field (some apps block programmatic editing). " +
                    "It may still accept a real tap into the field.",
                "text_refused",
                null,
                elapsed,
            )
        }
        // Confirmation that the text actually landed — not just "we asked".
        val landed = seen.trim() == text.trim() || seen.contains(text.trim())
        if (!landed && seen.isNotBlank()) {
            return AutomationResult.failed(
                action.name,
                "The field shows something other than what was typed (the app may format its input). " +
                    "Read the screen before submitting.",
                "text_not_confirmed",
                JSONObject().put("confirmed", false),
                elapsed,
            )
        }

        var submitted = false
        var submitMode = ""
        if (action.submit) {
            val before = readTree(service)?.digest ?: ""
            if (Build.VERSION.SDK_INT >= 30) {
                AccessibilityNodeHelper.withEditableNode(service) { node ->
                    node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
                }
                submitMode = "ime_enter"
            }
            waitForIdle(service, 350, 2_500)
            val after = readTree(service)?.digest ?: ""
            submitted = after != before
            if (!submitted) {
                // Many search boxes have a dedicated button instead of an IME action.
                AccessibilityNodeHelper.withNode(service, "search", "search", true) { node ->
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                }
                submitMode = "search_button"
                waitForIdle(service, 350, 2_500)
                submitted = (readTree(service)?.digest ?: "") != after
            }
        }

        waitForIdle(service, 250, 1_500)
        val afterTree = readTree(service)
        val afterSnap = afterTree?.let { snapshot(ctx, it) }
        val data = JSONObject()
            .put("chars", text.length)
            .put("typed", true)
            .put("submitted", submitted)
            .put("submit_mode", submitMode)
            .put("package", afterTree?.packageName ?: tree.packageName)
            .put("app", afterSnap?.appLabel ?: snap.appLabel)
            .put("digest_after", afterTree?.digest ?: "")
            .put("screen", afterSnap?.toJson() ?: JSONObject.NULL)

        if (action.submit && !submitted) {
            return AutomationResult.failed(
                action.name,
                "The text was entered, but nothing happened when submitting. There may be no search button " +
                    "and no IME action on this field — read the screen and tap the right control.",
                "submit_failed",
                data,
                System.currentTimeMillis() - started,
            )
        }
        return AutomationResult.success(
            action.name,
            if (submitted) {
                "Typed ${text.length} characters and submitted. Read the screen to confirm what changed."
            } else {
                "Typed ${text.length} characters. Read the screen to confirm what changed."
            },
            data,
            changed = true,
            durationMs = System.currentTimeMillis() - started,
        )
    }

    private fun scrollScreen(
        ctx: Context,
        service: AmitAccessibilityService,
        action: AutomationAction.ScrollScreen,
        started: Long,
    ): AutomationResult {
        val dir = action.direction.trim().lowercase(Locale.ROOT)
        val forward = dir == "down" || dir == "forward"
        val backward = dir == "up" || dir == "backward"
        val left = dir == "left"
        val right = dir == "right"
        if (!forward && !backward && !left && !right) {
            return AutomationResult.failed(
                action.name,
                "Direction must be up, down, left or right.",
                "invalid_argument",
            )
        }

        val tree = readTree(service) ?: return unreadable(action.name, started)
        val snap = snapshot(ctx, tree)
        snap.sensitive?.let { return sensitiveBlocked(action.name, it, started) }
        val before = tree.digest
        val hadScrollable = tree.nodes.any { it.scrollable && it.visible }

        var via = "node_action"
        val actionId = when {
            forward -> AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
            backward -> AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
            left -> AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_LEFT.id
            else -> AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_RIGHT.id
        }

        val performed = AccessibilityNodeHelper.withScrollableNode(service) { node ->
            val ok = node.performAction(actionId)
            if (ok) {
                true
            } else {
                val r = Rect().also { node.getBoundsInScreen(it) }
                via = "gesture_on_content"
                swipe(service, r, dir)
            }
        } ?: run {
            via = "gesture_on_screen"
            swipe(service, screenBounds(service), dir)
        }

        waitForIdle(service, 300, 2_200)
        val afterTree = readTree(service)
        val changed = afterTree == null || afterTree.digest != before
        val elapsed = System.currentTimeMillis() - started
        val data = JSONObject()
            .put("direction", dir)
            .put("via", via)
            .put("scrollable_present", hadScrollable)
            .put("digest_before", before)
            .put("digest_after", afterTree?.digest ?: "")
            .put("package", afterTree?.packageName ?: tree.packageName)

        if (!performed) {
            return AutomationResult.failed(
                action.name,
                "Nothing on this screen accepted a $dir scroll (no scrollable container and the gesture " +
                    "was rejected). Read the screen to see what is actually there.",
                "scroll_refused",
                data,
                elapsed,
            )
        }
        return if (changed) {
            AutomationResult.success(
                action.name,
                "Scrolled $dir; the screen changed. Read it before acting.",
                data,
                changed = true,
                durationMs = elapsed,
            )
        } else {
            AutomationResult.failed(
                action.name,
                "The $dir scroll was accepted but no visible content moved — probably already at the end " +
                    "of the list.",
                "no_visible_change",
                data,
                elapsed,
            )
        }
    }

    private fun pressBack(
        ctx: Context,
        service: AmitAccessibilityService,
        started: Long,
    ): AutomationResult {
        val tree = readTree(service)
        val before = tree?.digest ?: ""
        val beforePkg = tree?.packageName ?: foregroundPackage(service)
        val sent = performGlobal(service, AccessibilityService.GLOBAL_ACTION_BACK)
        if (!sent) {
            return AutomationResult.failed(
                "press_back",
                "Android refused the global back gesture.",
                "back_refused",
                durationMs = System.currentTimeMillis() - started,
            )
        }
        waitForIdle(service, 350, 2_500)
        val afterTree = readTree(service)
        val afterPkg = afterTree?.packageName ?: foregroundPackage(service)
        val changed = afterPkg != beforePkg || (afterTree != null && afterTree.digest != before)
        val elapsed = System.currentTimeMillis() - started
        val data = JSONObject()
            .put("package_before", beforePkg)
            .put("package_after", afterPkg)
            .put("digest_before", before)
            .put("digest_after", afterTree?.digest ?: "")
        return if (changed) {
            AutomationResult.success(
                "press_back",
                "Went back to ${appLabel(ctx, afterPkg).ifBlank { afterPkg }}. Read the screen before the next step.",
                data,
                changed = true,
                durationMs = elapsed,
            )
        } else {
            AutomationResult.failed(
                "press_back",
                "Back was sent but the screen did not change — this is probably the app's root screen.",
                "no_visible_change",
                data,
                elapsed,
            )
        }
    }

    /* --------------------------- service callbacks -------------------------- */

    fun onServiceConnected(service: AmitAccessibilityService) {
        val pkg = service.rootInActiveWindow?.packageName?.toString() ?: ""
        if (pkg.isNotBlank()) {
            AutomationState.currentPackage = pkg
            AutomationState.currentAppLabel = appLabel(service, pkg)
        }
        // A rebind means the service is back: the old "it was turned off"
        // reason is stale and must not colour the status card.
        if (AutomationState.blockedReason.contains("service was turned off", ignoreCase = true)) {
            AutomationState.blockedReason = ""
            if (AutomationState.status == AutomationState.STATUS_STOPPED ||
                AutomationState.status == AutomationState.STATUS_BLOCKED
            ) {
                AutomationState.status = AutomationState.STATUS_IDLE
            }
        }
        AutomationState.emitState()
    }

    fun onWindowChanged(service: AmitAccessibilityService, pkg: String, className: String) {
        if (pkg.isBlank()) return
        if (pkg != AutomationState.currentPackage) {
            AutomationState.currentPackage = pkg
            AutomationState.currentAppLabel = appLabel(service, pkg)
            AutomationState.emitState()
        }
    }

    /**
     * Runs whenever a window or its content changes while a session is active.
     * This is the "stop if an unexpected sensitive screen appears" rule: it is
     * enforced by the phone, not by the model remembering to check.
     */
    fun checkScreenSafety(service: AmitAccessibilityService, pkg: String) {
        if (!AutomationState.sessionActive) return
        // Only the window that actually has focus counts. Accessibility fires
        // events for the IME, nav bar and other system windows constantly;
        // treating every one of them as "a system screen appeared" made typing
        // impossible. A real permission dialog *is* the active root.
        val active = activeRootPackage(service) ?: pkg
        if (AutomationPolicy.isForbiddenPackage(active)) {
            safety.execute {
                blockSession(
                    service.applicationContext,
                    "A system or permission screen ($active) is in front. Android needs a human there, so " +
                        "automation stopped.",
                )
            }
            return
        }
        safety.execute {
            if (!AutomationState.sessionActive) return@execute
            val tree = AccessibilityNodeHelper.read(service) ?: return@execute
            val texts = tree.nodes.map { it.label }.filter { it.isNotBlank() }.take(120)
            val reason = AutomationPolicy.screenSensitivity(
                tree.packageName.ifBlank { pkg },
                texts,
                tree.hasPassword,
            ) ?: return@execute
            blockSession(service.applicationContext, reason)
        }
    }

    private fun blockSession(ctx: Context, reason: String) {
        if (!AutomationState.sessionActive && AutomationState.status == AutomationState.STATUS_BLOCKED) {
            return
        }
        cancelRequested = true
        answerConfirmationInternal(false)
        AutomationState.sessionActive = false
        AutomationState.status = AutomationState.STATUS_BLOCKED
        AutomationState.blockedReason = reason
        AutomationState.currentAction = ""
        AutomationState.emitState()
        AutomationEvents.error("sensitive_screen", reason)
        AutomationService.stop(ctx)
    }

    /* -------------------------------- helpers ------------------------------ */

    private fun unreadable(action: String, started: Long): AutomationResult =
        AutomationResult.blocked(
            action,
            "The screen could not be read. Android hides secure windows (banking apps, password " +
                "screens, some permission dialogs), and an app may block accessibility on purpose. " +
                "Do not guess — ask the user what is on screen.",
            "screen_not_readable",
            null,
            System.currentTimeMillis() - started,
        )

    private fun sensitiveBlocked(action: String, reason: String, started: Long): AutomationResult =
        AutomationResult.blocked(
            action,
            "Stopped: $reason. Automation never reads, types into or taps sensitive screens. " +
                "Hand the phone back to the user.",
            "sensitive_screen",
            JSONObject().put("reason", reason),
            System.currentTimeMillis() - started,
        )

    fun describeAction(action: AutomationAction): String = when (action) {
        is AutomationAction.OpenApp ->
            "Opening ${appLabelOrPackage(action.packageName)}"
        is AutomationAction.GetForegroundApp -> "Checking the foreground app"
        is AutomationAction.ListInstalledApps -> "Listing installed apps"
        is AutomationAction.GetScreenContent -> "Reading the screen"
        is AutomationAction.FindElement -> "Looking for an element"
        is AutomationAction.GetClickableElements -> "Listing clickable elements"
        is AutomationAction.TapElement -> "Tapping an element"
        is AutomationAction.TypeText -> "Typing ${action.text.length} characters"
        is AutomationAction.ScrollScreen -> "Scrolling ${action.direction}"
        is AutomationAction.PressBack -> "Going back"
        is AutomationAction.GetStatus -> "Checking automation status"
        is AutomationAction.Stop -> "Stopping automation"
        is AutomationAction.RequestConfirmation -> "Waiting for confirmation"
    }

    private fun appLabelOrPackage(pkg: String): String =
        pkg.substringAfterLast('.').replaceFirstChar { it.uppercase(Locale.ROOT) }

    fun appLabel(ctx: Context, pkg: String): String {
        if (pkg.isBlank()) return ""
        return try {
            val pm = ctx.packageManager
            val ai = if (Build.VERSION.SDK_INT >= 33) {
                pm.getApplicationInfo(pkg, PackageManager.ApplicationInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                pm.getApplicationInfo(pkg, 0)
            }
            ai.loadLabel(pm).toString()
        } catch (_: Throwable) {
            pkg
        }
    }

    /** Package of the window that really has focus, or null when unreadable. */
    private fun activeRootPackage(service: AmitAccessibilityService): String? {
        val root = service.activeRoot() ?: return null
        return try {
            root.packageName?.toString()?.ifBlank { null }
        } finally {
            AccessibilityNodeHelper.recycle(listOf(root))
        }
    }

    fun foregroundPackage(service: AmitAccessibilityService): String {        val root = service.rootInActiveWindow
        val pkg = try {
            root?.packageName?.toString() ?: ""
        } finally {
            AccessibilityNodeHelper.recycle(listOf(root))
        }
        if (pkg.isNotBlank()) return pkg
        return AutomationState.lastEventPackage
    }

    private fun readTree(service: AmitAccessibilityService): AccessibilityNodeHelper.Tree? {
        var attempt = 0
        while (attempt < 3) {
            val tree = AccessibilityNodeHelper.read(service)
            if (tree != null) return tree
            attempt++
            if (attempt < 3) settle(140)
        }
        return null
    }

    private fun snapshot(
        ctx: Context,
        tree: AccessibilityNodeHelper.Tree,
    ): AutomationState.ScreenSnapshot {
        val pkg = tree.packageName.ifBlank { AutomationState.currentPackage }
        val label = appLabel(ctx, pkg)
        val texts = tree.nodes.map { it.label }.filter { it.isNotBlank() }.take(160)
        val sensitive = AutomationPolicy.screenSensitivity(pkg, texts, tree.hasPassword)
        val snap = AutomationState.ScreenSnapshot(
            packageName = pkg,
            appLabel = label,
            digest = tree.digest,
            texts = texts,
            nodeCount = tree.nodeCount,
            clickableCount = AccessibilityNodeHelper.clickables(tree, 200).size,
            editableCount = AccessibilityNodeHelper.editableNodes(tree).size,
            sensitive = sensitive,
            capturedAt = System.currentTimeMillis(),
            windowTitle = tree.windowTitle,
        )
        AutomationState.screen = snap
        if (pkg.isNotBlank()) {
            AutomationState.currentPackage = pkg
            AutomationState.currentAppLabel = label
            AutomationState.persistLastPackage(ctx)
        }
        AutomationEvents.screen(snap)
        return snap
    }

    private fun matchNodes(
        tree: AccessibilityNodeHelper.Tree,
        text: String,
        desc: String,
        limit: Int,
    ): List<AccessibilityNodeHelper.UiNode> {
        val t = AccessibilityNodeHelper.norm(text)
        val d = AccessibilityNodeHelper.norm(desc)
        if (t.isEmpty() && d.isEmpty()) return emptyList()
        val scored = ArrayList<Pair<AccessibilityNodeHelper.UiNode, Int>>()
        for (n in tree.nodes) {
            if (!n.visible) continue
            val nt = AccessibilityNodeHelper.norm(n.text)
            val nd = AccessibilityNodeHelper.norm(n.description)
            val nh = AccessibilityNodeHelper.norm(n.hint)
            val nid = AccessibilityNodeHelper.norm(n.viewId.substringAfterLast('/'))
            var score = 0
            if (t.isNotEmpty()) {
                score += when {
                    nt == t -> 100
                    nt.startsWith(t) -> 86 - minOf(18, nt.length - t.length)
                    nt.contains(t) -> 62 - minOf(14, nt.length - t.length)
                    nh == t -> 60
                    nh.contains(t) -> 45
                    nid == t -> 88
                    nid.startsWith(t) -> 70 - minOf(14, nid.length - t.length)
                    nid.contains(t) -> 48 - minOf(12, nid.length - t.length)
                    else -> 0
                }
            }
            if (d.isNotEmpty()) {
                score += when {
                    nd == d -> 96
                    nd.startsWith(d) -> 86 - minOf(18, nd.length - d.length)
                    nd.contains(d) -> 58 - minOf(14, nd.length - d.length)
                    else -> 0
                }
            }
            if (score == 0) continue
            if (n.clickable) score += 12
            if (n.editable) score += 6
            scored.add(n to score)
        }
        return scored.sortedByDescending { it.second }.take(limit).map { it.first }
    }

    private fun waitForIdle(
        service: AmitAccessibilityService,
        quietMs: Long,
        maxMs: Long,
    ): Boolean {
        val deadline = System.currentTimeMillis() + maxMs
        var quietSince = System.currentTimeMillis()
        var lastVersion = AutomationState.contentVersion
        while (System.currentTimeMillis() < deadline) {
            if (cancelRequested) throw Stopped()
            if (AutomationState.contentVersion != lastVersion) {
                lastVersion = AutomationState.contentVersion
                quietSince = System.currentTimeMillis()
            }
            val quietFor = System.currentTimeMillis() - maxOf(quietSince, AutomationState.lastEventAt)
            if (quietFor >= quietMs) return true
            settle(80)
        }
        return false
    }

    private fun waitForPackage(
        service: AmitAccessibilityService,
        pkg: String,
        timeoutMs: Long,
    ): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (cancelRequested) throw Stopped()
            val seen = foregroundPackage(service)
            if (seen == pkg || seen.startsWith("$pkg.")) return true
            // Some launchers hand off through a trampoline activity; accept an
            // accessibility event from the target even when the root is null.
            if (AutomationState.lastEventPackage == pkg &&
                System.currentTimeMillis() - AutomationState.lastEventAt < 1_500
            ) return true
            settle(120)
        }
        return false
    }

    private fun settle(ms: Long) {
        try {
            Thread.sleep(ms)
        } catch (_: InterruptedException) {
            throw Stopped()
        }
        if (cancelRequested) throw Stopped()
    }

    private fun performGlobal(service: AmitAccessibilityService, action: Int): Boolean {
        var ok = false
        onMain {
            ok = service.performGlobalAction(action)
        }
        return ok
    }

    private fun screenBounds(service: AmitAccessibilityService): Rect {
        val dm = service.resources.displayMetrics
        return Rect(0, 0, dm.widthPixels, dm.heightPixels)
    }

    private fun swipe(
        service: AmitAccessibilityService,
        bounds: Rect,
        direction: String,
    ): Boolean {
        if (bounds.width() <= 0 || bounds.height() <= 0) return false
        val cx = bounds.centerX()
        val cy = bounds.centerY()
        // Gestures are derived from the scrollable element's own bounds — never
        // from hard-coded screen coordinates — and only as a fallback when the
        // container refuses ACTION_SCROLL_*.
        val path = Path()
        when (direction) {
            "down" -> {
                path.moveTo(cx.toFloat(), (bounds.top + bounds.height() * 0.75f).toFloat())
                path.lineTo(cx.toFloat(), (bounds.top + bounds.height() * 0.25f).toFloat())
            }
            "up" -> {
                path.moveTo(cx.toFloat(), (bounds.top + bounds.height() * 0.25f).toFloat())
                path.lineTo(cx.toFloat(), (bounds.top + bounds.height() * 0.75f).toFloat())
            }
            "right" -> {
                path.moveTo((bounds.left + bounds.width() * 0.8f).toFloat(), cy.toFloat())
                path.lineTo((bounds.left + bounds.width() * 0.2f).toFloat(), cy.toFloat())
            }
            else -> {
                path.moveTo((bounds.left + bounds.width() * 0.2f).toFloat(), cy.toFloat())
                path.lineTo((bounds.left + bounds.width() * 0.8f).toFloat(), cy.toFloat())
            }
        }
        return gesture(service, path, 280)
    }

    private fun gesture(service: AmitAccessibilityService, path: Path, durationMs: Long): Boolean {
        val description = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()
        val done = CountDownLatch(1)
        var completed = false
        val callback = object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                completed = true
                done.countDown()
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                completed = false
                done.countDown()
            }
        }
        var dispatched = false
        onMain {
            dispatched = service.dispatchGesture(description, callback, null)
        }
        if (!dispatched) return false
        return try {
            done.await(durationMs + 1_500, TimeUnit.MILLISECONDS) && completed
        } catch (_: InterruptedException) {
            false
        }
    }

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            block()
            return
        }
        val latch = CountDownLatch(1)
        Handler(Looper.getMainLooper()).post {
            try {
                block()
            } finally {
                latch.countDown()
            }
        }
        try {
            latch.await(3, TimeUnit.SECONDS)
        } catch (_: InterruptedException) {
        }
    }
}
