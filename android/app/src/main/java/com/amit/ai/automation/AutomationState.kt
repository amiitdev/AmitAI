package com.amit.ai.automation

import android.content.Context
import com.amit.ai.AssistantBus
import org.json.JSONArray
import org.json.JSONObject

/**
 * Everything the UI needs to know about automation, in one place.
 *
 * The service, the manager and the React Native module all live in the same
 * process, so a plain singleton is enough — but every field is @Volatile
 * because actions run on the automation worker thread while the UI reads state
 * from the JS thread. No AccessibilityNodeInfo is ever kept here: only copied
 * strings. A node reference in state would go stale the moment the screen
 * changes, which is exactly the bug that makes accessibility automation flaky.
 */
object AutomationState {

    const val STATUS_IDLE = "idle"
    const val STATUS_RUNNING = "running"
    const val STATUS_AWAITING_CONFIRMATION = "awaiting_confirmation"
    const val STATUS_STOPPED = "stopped"
    const val STATUS_BLOCKED = "blocked"
    const val STATUS_NO_PERMISSION = "no_permission"

    /* ------------------------------ prefs keys ----------------------------- */

    private const val PREFS = "amit_automation"
    private const val K_ENABLED = "action_mode"
    private const val K_HISTORY = "history"
    private const val K_LAST_PACKAGE = "last_package"

    /** Hard ceiling on actions in one session — a runaway model cannot loop forever. */
    const val MAX_STEPS = 40

    /** Consecutive failures before the engine refuses to keep tapping blindly. */
    const val MAX_CONSECUTIVE_FAILURES = 3

    private const val HISTORY_MAX = 60

    /* ------------------------------- runtime ------------------------------- */

    @Volatile var serviceConnected: Boolean = false

    /** Action Mode master switch. Off = every tool refuses with permission_missing. */
    @Volatile var actionMode: Boolean = false

    @Volatile var sessionActive: Boolean = false

    @Volatile var status: String = STATUS_IDLE

    @Volatile var currentPackage: String = ""
    @Volatile var currentAppLabel: String = ""

    /** Human description of the action in flight, shown in the UI strip. */
    @Volatile var currentAction: String = ""

    @Volatile var completedCount: Int = 0
    @Volatile var failedCount: Int = 0
    @Volatile var consecutiveFailures: Int = 0
    @Volatile var steps: Int = 0

    /** Last known screen, copied out of the accessibility tree. */
    @Volatile var screen: ScreenSnapshot? = null

    /** Reason automation is paused: sensitive screen, step budget, user stop. */
    @Volatile var blockedReason: String = ""

    /** Set when a confirmation dialog is waiting for the user. */
    @Volatile var pendingConfirmId: String? = null
    @Volatile var pendingConfirmText: String = ""

    /** Wall clock of the last accessibility event — the "is the screen still moving" clock. */
    @Volatile var lastEventAt: Long = 0
    @Volatile var lastEventPackage: String = ""

    /** Monotonic counter bumped on every content/window change. */
    @Volatile var contentVersion: Long = 0

    /** Granted confirmation is valid for this long, for the risky-tap guard. */
    @Volatile var confirmedAt: Long = 0

    private val history = mutableListOf<HistoryEntry>()
    private val historyLock = Any()

    /* --------------------------------- types ------------------------------- */

    data class ScreenSnapshot(
        val packageName: String,
        val appLabel: String,
        val digest: String,
        val texts: List<String>,
        val nodeCount: Int,
        val clickableCount: Int,
        val editableCount: Int,
        val sensitive: String?,
        val capturedAt: Long,
        val windowTitle: String,
    ) {
        fun toJson(): JSONObject = JSONObject().apply {
            put("package", packageName)
            put("app", appLabel)
            put("digest", digest)
            put("node_count", nodeCount)
            put("clickable_count", clickableCount)
            put("editable_count", editableCount)
            if (sensitive != null) put("sensitive", sensitive) else put("sensitive", JSONObject.NULL)
            put("captured_at", capturedAt)
            put("window_title", windowTitle)
        }
    }

    data class HistoryEntry(
        val at: Long,
        val action: String,
        val status: String,
        val message: String,
        val app: String,
        val durationMs: Long,
    ) {
        fun toJson(): JSONObject = JSONObject().apply {
            put("at", at)
            put("action", action)
            put("status", status)
            put("message", message)
            put("app", app)
            put("duration_ms", durationMs)
        }
    }

    /* ------------------------------- lifecycle ----------------------------- */

    fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun load(c: Context) {
        val p = prefs(c)
        actionMode = p.getBoolean(K_ENABLED, false)
        currentPackage = p.getString(K_LAST_PACKAGE, "") ?: ""
        synchronized(historyLock) {
            history.clear()
            history.addAll(parseHistory(p.getString(K_HISTORY, "[]") ?: "[]"))
        }
    }

    fun setEnabled(c: Context, on: Boolean) {
        actionMode = on
        prefs(c).edit().putBoolean(K_ENABLED, on).apply()
        if (!on) {
            status = STATUS_STOPPED
            currentAction = ""
            sessionActive = false
        }
        emitState()
    }

    fun beginSession() {
        sessionActive = true
        status = STATUS_IDLE
        steps = 0
        completedCount = 0
        failedCount = 0
        consecutiveFailures = 0
        blockedReason = ""
        currentAction = ""
        emitState()
    }

    fun endSession(reason: String = "") {
        sessionActive = false
        currentAction = ""
        if (status == STATUS_RUNNING || status == STATUS_AWAITING_CONFIRMATION) {
            status = STATUS_STOPPED
        }
        if (reason.isNotBlank()) blockedReason = reason
        emitState()
    }

    fun resetStop() {
        if (status == STATUS_STOPPED || status == STATUS_BLOCKED) {
            status = STATUS_IDLE
            blockedReason = ""
        }
    }

    fun progress(): Double =
        if (MAX_STEPS <= 0) 0.0 else (steps.toDouble() / MAX_STEPS).coerceIn(0.0, 1.0)

    /* -------------------------------- events ------------------------------- */

    fun emitState() {
        AutomationEvents.emit("AmitAutomationState", stateJson())
    }

    fun stateJson(): JSONObject = JSONObject().apply {
        put("action_mode", actionMode)
        put("service_connected", serviceConnected)
        put("session_active", sessionActive)
        put("status", status)
        put("package", currentPackage)
        put("app", currentAppLabel)
        put("action", currentAction)
        put("completed", completedCount)
        put("failed", failedCount)
        put("steps", steps)
        put("max_steps", MAX_STEPS)
        put("progress", progress())
        put("blocked_reason", blockedReason)
        put("pending_confirm_id", pendingConfirmId ?: JSONObject.NULL)
        put("pending_confirm_text", pendingConfirmText)
        put("screen", screen?.toJson() ?: JSONObject.NULL)
        put("since", lastEventAt)
    }

    /* ------------------------------- history ------------------------------- */

    fun record(result: AutomationResult, appLabel: String = currentAppLabel, count: Boolean = true) {
        val entry = HistoryEntry(
            at = result.at,
            action = result.action,
            status = result.status,
            message = result.message,
            app = appLabel,
            durationMs = result.durationMs,
        )
        synchronized(historyLock) {
            history.add(0, entry)
            while (history.size > HISTORY_MAX) history.removeAt(history.size - 1)
        }
        if (result.ok) {
            completedCount++
            consecutiveFailures = 0
        } else if (count && (result.status == AutomationResult.STATUS_FAILED ||
                result.status == AutomationResult.STATUS_TIMEOUT)
        ) {
            failedCount++
            consecutiveFailures++
        }
        emitState()
    }

    fun historyJson(): JSONArray {
        val arr = JSONArray()
        synchronized(historyLock) { history.forEach { arr.put(it.toJson()) } }
        return arr
    }

    fun persistHistory(c: Context) {
        prefs(c).edit().putString(K_HISTORY, historyJson().toString()).apply()
    }

    fun persistLastPackage(c: Context) {
        prefs(c).edit().putString(K_LAST_PACKAGE, currentPackage).apply()
    }

    fun clearHistory(c: Context) {
        synchronized(historyLock) { history.clear() }
        prefs(c).edit().remove(K_HISTORY).apply()
        emitState()
    }

    private fun parseHistory(raw: String): List<HistoryEntry> = try {
        val arr = JSONArray(raw)
        (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            HistoryEntry(
                at = o.optLong("at"),
                action = o.optString("action"),
                status = o.optString("status"),
                message = o.optString("message"),
                app = o.optString("app"),
                durationMs = o.optLong("duration_ms"),
            )
        }
    } catch (_: Throwable) {
        emptyList()
    }
}

/**
 * Automation → JS events.
 *
 * Same tiny bus the wake word and share sheet already use, with a JSON string
 * payload: the bridge stays one event name per concern, and JS parses once.
 */
object AutomationEvents {

    fun emit(name: String, json: JSONObject) {
        AssistantBus.emit(name, "json", json.toString())
    }

    fun action(result: AutomationResult) {
        emit("AmitAutomationEvent", result.toJson())
    }

    fun screen(snapshot: AutomationState.ScreenSnapshot?) {
        if (snapshot == null) return
        emit("AmitAutomationScreen", snapshot.toJson())
    }

    fun confirm(id: String, description: String, timeoutMs: Long) {
        emit(
            "AmitAutomationConfirm",
            JSONObject()
                .put("id", id)
                .put("description", description)
                .put("timeout_ms", timeoutMs),
        )
    }

    fun error(code: String, message: String) {
        emit("AmitAutomationError", JSONObject().put("code", code).put("message", message))
    }
}
