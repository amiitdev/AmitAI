package com.amit.ai

import android.content.Context
import java.io.File

object AssistantPrefs {
    private const val FILE = "amit_assistant"

    const val POLICY_CHARGING = "chargingOrScreenOff"
    const val POLICY_ALWAYS = "always"
    const val POLICY_APP_ONLY = "appOnly"

    const val MODEL_DIR = "vosk-model-small-en-us-0.15"

    fun prefs(c: Context) = c.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun wakeEnabled(c: Context) = prefs(c).getBoolean("wake", false)
    fun setWakeEnabled(c: Context, v: Boolean) = prefs(c).edit().putBoolean("wake", v).apply()

    fun bubbleEnabled(c: Context) = prefs(c).getBoolean("bubble", false)
    fun setBubbleEnabled(c: Context, v: Boolean) = prefs(c).edit().putBoolean("bubble", v).apply()

    /** Tool server survives backgrounding (foreground service) when this is on. */
    fun mcpServiceEnabled(c: Context) = prefs(c).getBoolean("mcp_service", true)
    fun setMcpServiceEnabled(c: Context, v: Boolean) = prefs(c).edit().putBoolean("mcp_service", v).apply()

    fun policy(c: Context) = prefs(c).getString("policy", POLICY_CHARGING) ?: POLICY_CHARGING
    fun setPolicy(c: Context, v: String) = prefs(c).edit().putString("policy", v).apply()

    fun modelDir(c: Context) = File(c.filesDir, MODEL_DIR)

    /** A Vosk model is ready when the acoustic + language folders exist. */
    fun modelReady(c: Context): Boolean {
        val d = modelDir(c)
        return File(d, "am").exists() || (File(d, "conf").exists() && File(d, "graph").exists())
    }
}
