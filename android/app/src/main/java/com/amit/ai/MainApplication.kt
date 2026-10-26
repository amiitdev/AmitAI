package com.amit.ai

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(AmitVoicePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    // Expose AmitAI's own tools to the local opencode agent (MCP, loopback only).
    // With "keep running" on, the foreground service owns the server instead, so
    // the agent can still reach it while AmitAI is not the app on screen.
    if (AssistantPrefs.mcpServiceEnabled(this)) {
      McpService.startService(this)
    } else {
      AmitMcpServer.start(this)
    }
  }
}
