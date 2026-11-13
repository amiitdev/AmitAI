package com.amit.ai.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The safety rules, tested as pure functions.
 *
 * These are the checks that stop a tap before it happens. They are plain
 * string/regex logic on purpose so they can be proven here without a phone.
 */
class AutomationPolicyTest {

    private fun sensitive(pkg: String, texts: List<String>, password: Boolean = false) =
        AutomationPolicy.screenSensitivity(pkg, texts, password)

    @Test
    fun passwordFieldsAlwaysBlock() {
        assertNotNull(sensitive("com.whatsapp", listOf("Chats"), password = true))
    }

    @Test
    fun otpAndCardScreensBlock() {
        assertNotNull(sensitive("com.example.shop", listOf("Enter the OTP sent to your phone")))
        assertNotNull(sensitive("com.example.shop", listOf("CVV")))
        assertNotNull(sensitive("com.example.shop", listOf("UPI PIN")))
        assertNotNull(sensitive("com.example.shop", listOf("Proceed to pay")))
    }

    @Test
    fun financialAppsBlockByPackage() {
        assertNotNull(sensitive("com.phonepe.app", emptyList()))
        assertNotNull(sensitive("com.sbi.bank", listOf("Home")))
    }

    @Test
    fun systemAndPermissionScreensBlock() {
        assertNotNull(sensitive("com.android.permissioncontroller", emptyList()))
        assertNotNull(sensitive("com.android.systemui", emptyList()))
        assertTrue(AutomationPolicy.isForbiddenPackage("com.android.settings"))
    }

    @Test
    fun ordinaryScreensAreAllowed() {
        assertNull(sensitive("com.google.android.youtube", listOf("Search", "Home", "Shorts")))
        assertNull(sensitive("com.whatsapp", listOf("Riya", "Type a message")))
    }

    @Test
    fun destructiveTapsNeedConfirmation() {
        assertEquals("send", AutomationPolicy.riskyKeyword("Send"))
        assertNotNull(AutomationPolicy.riskyKeyword("Pay now"))
        assertNotNull(AutomationPolicy.riskyKeyword("Delete"))
        assertNotNull(AutomationPolicy.riskyKeyword("Uninstall"))
        assertNull(AutomationPolicy.riskyKeyword("Search"))
        assertNull(AutomationPolicy.riskyKeyword("Play"))
    }
}
