package com.amit.ai.automation

/**
 * One thing the automation engine can be asked to do.
 *
 * Every action is a plain data class with already-validated arguments: the
 * React Native module validates and clamps first (so a bad arg never reaches
 * the phone's UI tree), then hands one of these to AutomationManager.
 *
 * Keeping the action list as sealed classes means `when` blocks in the manager
 * are exhaustive — adding a tool without handling it is a compile error, not a
 * silent no-op at runtime.
 */
sealed class AutomationAction {

    /** Stable tool name, also what the agent sees in the result envelope. */
    abstract val name: String

    /**
     * Launch an app by package, optionally through one of its own deep links.
     * Intents first — the accessibility tree is only used when a real tap is
     * needed, never to navigate to an app we can start directly.
     */
    data class OpenApp(val packageName: String, val uri: String? = null) : AutomationAction() {
        override val name = "open_app"
    }

    object GetForegroundApp : AutomationAction() {
        override val name = "get_foreground_app"
    }

    data class ListInstalledApps(val query: String? = null, val limit: Int = 400) :
        AutomationAction() {
        override val name = "list_installed_apps"
    }

    data class GetScreenContent(val limit: Int = 80) : AutomationAction() {
        override val name = "get_screen_content"
    }

    data class FindElement(val text: String?, val contentDescription: String?) :
        AutomationAction() {
        override val name = "find_element"
    }

    data class GetClickableElements(val limit: Int = 40) : AutomationAction() {
        override val name = "get_clickable_elements"
    }

    data class TapElement(val text: String?, val contentDescription: String?) :
        AutomationAction() {
        override val name = "tap_element"
    }

    /** `submit` presses the keyboard's action key (or the search button) after typing. */
    data class TypeText(val text: String, val submit: Boolean = false) : AutomationAction() {
        override val name = "type_text"
    }

    /** direction: up | down | left | right (forward/backward accepted as aliases). */
    data class ScrollScreen(val direction: String) : AutomationAction() {
        override val name = "scroll_screen"
    }

    object PressBack : AutomationAction() {
        override val name = "press_back"
    }

    object GetStatus : AutomationAction() {
        override val name = "get_automation_status"
    }

    object Stop : AutomationAction() {
        override val name = "stop_automation"
    }

    data class RequestConfirmation(val description: String, val timeoutMs: Long) :
        AutomationAction() {
        override val name = "request_user_confirmation"
    }
}
