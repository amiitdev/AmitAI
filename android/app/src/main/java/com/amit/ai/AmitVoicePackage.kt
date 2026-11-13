package com.amit.ai

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AmitVoicePackage : ReactPackage {
  override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
      listOf(
          AmitVoiceModule(ctx),
          AmitAssistantModule(ctx),
          AmitSchedulerModule(ctx),
          // Action Mode: accessibility-driven UI automation (opt-in).
          com.amit.ai.automation.AmitAutomationModule(ctx),
      )

  override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
      emptyList()
}
