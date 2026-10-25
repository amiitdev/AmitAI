package com.amit.ai

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap

/**
 * Tiny event bus so a Service (wake word, bubble) can reach JS without
 * holding a reference to the module instance. The module registers its
 * ReactContext here; everything else just calls emit().
 */
object AssistantBus {
    @Volatile
    var reactContext: ReactApplicationContext? = null

    fun emit(name: String) = emit(name, null, null)

    fun emit(name: String, key: String?, value: String?) {
        val ctx = reactContext ?: return
        val map: WritableMap = Arguments.createMap()
        if (key != null) map.putString(key, value)
        map.putDouble("ts", System.currentTimeMillis().toDouble())
        try {
            ctx.emitDeviceEvent(name, map)
        } catch (_: Throwable) {
        }
    }
}
