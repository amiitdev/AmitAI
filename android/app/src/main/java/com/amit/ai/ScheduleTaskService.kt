package com.amit.ai

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the scheduled prompt with the real React instance.
 *
 * JS side: `AppRegistry.registerHeadlessTask('AmitScheduleTask', …)` in index.js,
 * which loads settings, runs the same agent loop a chat message would, posts the
 * notification and stores the result.
 *
 * 5 minutes is deliberately generous: a free reasoning model can take a while,
 * and a cut-off task would mean a job that never notifies.
 */
class ScheduleTaskService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val id = intent?.getStringExtra("id") ?: return null
        val data = Arguments.createMap().apply {
            putString("id", id)
            putString("title", intent.getStringExtra("title") ?: "AmitAI task")
            putString("prompt", intent.getStringExtra("prompt") ?: "")
        }
        return HeadlessJsTaskConfig(
            "AmitScheduleTask",
            data,
            300_000L,
            true, // also run when the user happens to have the app open
        )
    }
}
