package com.amit.ai.automation

import java.util.Locale

/**
 * The brake pedal.
 *
 * Android gives an accessibility service the power to read and click anything
 * that is not explicitly marked secure. Nothing in this app's own logic can
 * make that safe on its own, so the rules live here, in one readable file:
 *
 *  1. Screens that look like authentication or money get automation stopped —
 *     before a tap, not after. Passwords and OTPs are never read out. (We only
 *     ever see `isPassword = true`, never the characters.)
 *  2. System permission dialogs are never touched. "Allow" is a human answer.
 *  3. Destructive or irreversible taps (send, pay, delete, uninstall, place
 *     order) need a fresh confirmation from the user, even if the model says it
 *     already asked.
 *  4. After MAX_CONSECUTIVE_FAILURES misses the engine stops instead of
 *     hammering the screen — the observe → act → verify loop's own escape hatch.
 *
 * This is defence in depth, not a guarantee: a badly labelled button in a
 * third-party app can still be mis-clicked. That is why every tap is verified
 * against the screen afterwards and every step is visible in the UI.
 */
object AutomationPolicy {

    /** Never drive these: they are the permission/authentication surface itself. */
    private val forbiddenPackages = listOf(
        "com.android.permissioncontroller",
        "com.google.android.permissioncontroller",
        "com.android.packageinstaller",
        "com.google.android.packageinstaller",
        "com.android.systemui",
        "com.android.settings",
        "com.google.android.settings",
        "com.android.keychain",
        "com.google.android.gms.auth",
        "com.google.android.gms",
        "com.android.credentialmanager",
    )

    /** Package-name hints for banking, wallets and trading apps. */
    private val moneyPackageHint = Regex(
        "(bank|paytm|phonepe|gpay|tez|wallet|upi|bhim|cred|money|finance|zerodha|groww|upstox|angelone|kuvera|indmoney|paypal|stripe|razorpay)",
        RegexOption.IGNORE_CASE,
    )

    /** Screen text that means "this is authentication or money — stop". */
    private val sensitiveText = listOf(
        Regex("\\botp\\b", RegexOption.IGNORE_CASE),
        Regex("one[\\s-]?time (password|code|pin)", RegexOption.IGNORE_CASE),
        Regex("verification code", RegexOption.IGNORE_CASE),
        Regex("\\b(cvv|cvc)\\b", RegexOption.IGNORE_CASE),
        Regex("card number", RegexOption.IGNORE_CASE),
        Regex("valid (thru|through)", RegexOption.IGNORE_CASE),
        Regex("\\b(upi|atm|mpin|transaction|login) pin\\b", RegexOption.IGNORE_CASE),
        Regex("\\bmpin\\b", RegexOption.IGNORE_CASE),
        Regex("net\\s?banking|internet banking", RegexOption.IGNORE_CASE),
        Regex("security code", RegexOption.IGNORE_CASE),
        Regex("authenticator", RegexOption.IGNORE_CASE),
        Regex("two[\\s-]?factor|2fa", RegexOption.IGNORE_CASE),
        Regex("confirm (payment|purchase)|proceed to pay|pay now", RegexOption.IGNORE_CASE),
        Regex("\\bamount to pay\\b", RegexOption.IGNORE_CASE),
    )

    /** Tap labels that need a human "yes" first. */
    private val riskyTap = listOf(
        Regex("\\bsend\\b", RegexOption.IGNORE_CASE),
        Regex("\\bpay\\b|\\bbuy\\b|\\bpurchase\\b|place order|confirm order", RegexOption.IGNORE_CASE),
        Regex("\\bdelete\\b|\\bremove\\b|\\berase\\b|\\bformat\\b", RegexOption.IGNORE_CASE),
        Regex("\\buninstall\\b|\\binstall\\b", RegexOption.IGNORE_CASE),
        Regex("\\btransfer\\b|\\bwithdraw\\b|\\bcheckout\\b", RegexOption.IGNORE_CASE),
        Regex("\\bpost\\b|\\btweet\\b|\\bpublish\\b|\\bsubmit order\\b", RegexOption.IGNORE_CASE),
        Regex("\\blog ?out\\b|\\bsign out\\b|\\bdeactivate\\b|\\bblock\\b|\\breport\\b", RegexOption.IGNORE_CASE),
        Regex("allow|permit|grant", RegexOption.IGNORE_CASE),
    )

    /** A confirmation stays valid this long and applies to the next risky tap only. */
    private const val CONFIRM_TTL_MS = 120_000L

    fun isForbiddenPackage(pkg: String?): Boolean {
        val p = (pkg ?: "").lowercase(Locale.ROOT).trim()
        if (p.isEmpty()) return false
        return forbiddenPackages.any { p == it || p.startsWith("$it.") }
    }

    /**
     * Why this screen must not be automated, or null when it is fine.
     * `hasPasswordField` comes from the accessibility tree (`isPassword`).
     */
    fun screenSensitivity(
        packageName: String,
        texts: List<String>,
        hasPasswordField: Boolean,
        hasWebPasswordField: Boolean = false,
    ): String? {
        if (isForbiddenPackage(packageName)) {
            return "system or permission screen ($packageName) — Android requires a human here"
        }
        if (hasPasswordField || hasWebPasswordField) {
            return "password field on screen — automation is not allowed to touch it"
        }
        if (moneyPackageHint.containsMatchIn(packageName)) {
            return "financial app ($packageName) — payments and banking are never automated"
        }
        val joined = texts.joinToString(" ").take(20_000)
        for (rx in sensitiveText) {
            val m = rx.find(joined) ?: continue
            return "sensitive screen text “${m.value}” — stopping before anything is entered"
        }
        return null
    }

    /** The risky keyword in a tap target, or null when the tap is ordinary. */
    fun riskyKeyword(label: String): String? {
        val clean = label.trim()
        if (clean.isEmpty()) return null
        for (rx in riskyTap) {
            val m = rx.find(clean) ?: continue
            return m.value.lowercase(Locale.ROOT)
        }
        return null
    }

    fun requiresConfirmation(label: String): Boolean = riskyKeyword(label) != null

    fun confirmationFresh(now: Long = System.currentTimeMillis()): Boolean =
        AutomationState.confirmedAt > 0 && now - AutomationState.confirmedAt <= CONFIRM_TTL_MS

    /** Consume the confirmation so one "yes" can never authorise two destructive taps. */
    fun consumeConfirmation() {
        AutomationState.confirmedAt = 0
    }

    fun grantConfirmation() {
        AutomationState.confirmedAt = System.currentTimeMillis()
    }
}
