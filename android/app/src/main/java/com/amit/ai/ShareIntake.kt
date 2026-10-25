package com.amit.ai

import android.content.Context
import android.content.Intent
import android.net.Uri
import java.io.File

/**
 * Incoming "Share to AmitAI" payloads.
 *
 * A shared text or image arrives as an Intent, often before the React instance
 * exists. The payload is therefore parked here (process memory) and pulled by JS
 * with AmitAssistant.consumeShare() once the UI is ready.
 *
 * Shared images are copied into the app cache immediately: a `content://` URI
 * from another app is only readable while that app's grant lasts, so handing the
 * raw URI to JS would break the moment the sender is killed.
 */
data class SharedPayload(val text: String, val images: List<String>, val at: Long)

object ShareIntake {
    private var pending: SharedPayload? = null

    @Synchronized
    fun capture(context: Context, intent: Intent?): Boolean {
        if (intent == null) return false
        try {
            return captureUnsafe(context, intent)
        } catch (_: Throwable) {
            // A malformed intent from a third-party app must never close ours.
            return false
        }
    }

    private fun captureUnsafe(context: Context, intent: Intent): Boolean {
        when (intent.action) {
            Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE, Intent.ACTION_PROCESS_TEXT -> Unit
            else -> return false
        }

        val text = when (intent.action) {
            Intent.ACTION_PROCESS_TEXT ->
                intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString().orEmpty()
            else -> intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty()
        }.trim()

        val uris = mutableListOf<Uri>()
        intent.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { uris.add(it) }
        }
        @Suppress("DEPRECATION")
        intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.addAll(it) }
        intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.add(it) }

        val images = uris.mapNotNull { copyToCache(context, it) }
        if (text.isBlank() && images.isEmpty()) return false

        pending = SharedPayload(text, images, System.currentTimeMillis())
        return true
    }

    @Synchronized
    fun consume(): SharedPayload? {
        val p = pending
        pending = null
        return p
    }

    /** Copy a shared image into cache/share so it stays readable after send. */
    private fun copyToCache(context: Context, uri: Uri): String? {
        return try {
            val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
            if (!mime.startsWith("image/")) return null
            val ext = when {
                mime.contains("png") -> "png"
                mime.contains("webp") -> "webp"
                mime.contains("gif") -> "gif"
                mime.contains("heic") || mime.contains("heif") -> "heic"
                else -> "jpg"
            }
            val dir = File(context.cacheDir, "share").apply { mkdirs() }
            // Old shares are disposable; keep the folder from growing forever.
            dir.listFiles()?.filter { it.lastModified() < System.currentTimeMillis() - 86_400_000 }
                ?.forEach { it.delete() }

            val out = File(dir, "share-${System.currentTimeMillis()}-${uri.hashCode()}.$ext")
            context.contentResolver.openInputStream(uri)?.use { input ->
                out.outputStream().use { input.copyTo(it) }
            } ?: return null
            if (out.length() == 0L) {
                out.delete()
                null
            } else {
                Uri.fromFile(out).toString()
            }
        } catch (_: Throwable) {
            null
        }
    }
}
