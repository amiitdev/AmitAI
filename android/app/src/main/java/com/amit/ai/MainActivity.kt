package com.amit.ai

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "AmitAI"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Cold start from "Share to AmitAI": park the payload for JS, which calls
    // AmitAssistant.consumeShare() as soon as the chat screen mounts.
    ShareIntake.capture(this, intent)
  }

  /** Bubble / wake word / share while the app is already alive. */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)

    if (intent.getBooleanExtra("amit_voice", false)) {
      AssistantBus.emit("AmitAssistantWake", "phrase", "intent")
    }
    if (ShareIntake.capture(this, intent)) {
      // The event is only a nudge; the payload itself is pulled by consumeShare
      // so a slow JS bridge cannot lose it.
      AssistantBus.emit("AmitShared", "kind", intent.action ?: "share")
    }
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
