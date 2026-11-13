package com.amit.ai.automation

import org.json.JSONObject

/**
 * The one shape every automation tool returns.
 *
 * `status` is deliberately narrow: the agent branches on it, so a half-finished
 * action can never be reported as success. `ok` is only true for "success".
 *
 *   success            Android confirmed the action
 *   failed             the action ran but Android said no, or verified nothing happened
 *   timeout            the screen never reached the expected state in time
 *   cancelled          the user (or stop_automation) cancelled it
 *   blocked            a safety policy refused it (sensitive screen, confirmation)
 *   needs_confirmation a confirmation prompt is waiting for the user
 */
data class AutomationResult(
    val status: String,
    val action: String,
    val message: String,
    val errorCode: String? = null,
    val changed: Boolean? = null,
    val durationMs: Long = 0,
    val data: JSONObject? = null,
    val at: Long = System.currentTimeMillis(),
) {
    val ok: Boolean get() = status == STATUS_SUCCESS

    fun toJson(): JSONObject = JSONObject().apply {
        put("status", status)
        put("ok", ok)
        put("action", action)
        put("message", message)
        if (errorCode != null) put("error_code", errorCode) else put("error_code", JSONObject.NULL)
        if (changed != null) put("changed", changed) else put("changed", JSONObject.NULL)
        put("duration_ms", durationMs)
        put("at", at)
        put("data", data ?: JSONObject())
    }

    fun toJsonString(): String = toJson().toString()

    companion object {
        const val STATUS_SUCCESS = "success"
        const val STATUS_FAILED = "failed"
        const val STATUS_TIMEOUT = "timeout"
        const val STATUS_CANCELLED = "cancelled"
        const val STATUS_BLOCKED = "blocked"
        const val STATUS_NEEDS_CONFIRMATION = "needs_confirmation"

        fun success(
            action: String,
            message: String,
            data: JSONObject? = null,
            changed: Boolean? = null,
            durationMs: Long = 0,
        ) = AutomationResult(STATUS_SUCCESS, action, message, null, changed, durationMs, data)

        fun failed(
            action: String,
            message: String,
            code: String,
            data: JSONObject? = null,
            durationMs: Long = 0,
        ) = AutomationResult(STATUS_FAILED, action, message, code, null, durationMs, data)

        fun timeout(
            action: String,
            message: String,
            code: String = "timeout",
            data: JSONObject? = null,
            durationMs: Long = 0,
        ) = AutomationResult(STATUS_TIMEOUT, action, message, code, null, durationMs, data)

        fun cancelled(
            action: String,
            message: String = "Automation was stopped before this action finished.",
            durationMs: Long = 0,
        ) = AutomationResult(STATUS_CANCELLED, action, message, "cancelled", null, durationMs, null)

        fun blocked(
            action: String,
            message: String,
            code: String,
            data: JSONObject? = null,
            durationMs: Long = 0,
        ) = AutomationResult(STATUS_BLOCKED, action, message, code, null, durationMs, data)
    }
}
