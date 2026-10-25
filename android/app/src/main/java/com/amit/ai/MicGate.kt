package com.amit.ai

/**
 * Microphone arbitration.
 *
 * Android has one mic: whoever holds the AudioRecord wins, and Google's speech
 * service reports "cannot record" when the wake-word listener has it. So the
 * wake listener yields the mic whenever the app is on screen (the user can tap
 * the mic themselves) or while Google's recogniser is active.
 */
object MicGate {
    @Volatile
    var appVisible: Boolean = false

    @Volatile
    var sttActive: Boolean = false

    val blocked: Boolean
        get() = appVisible || sttActive
}
