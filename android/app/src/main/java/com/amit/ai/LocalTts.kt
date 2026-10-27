package com.amit.ai

import android.content.Context
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKittenModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.io.File

/**
 * Offline neural text-to-speech, on the phone, with no server and no key.
 *
 * Two engines ship in the APK:
 *   piper  — VITS (en_US-lessac-low, int8) — natural, ~18 MB
 *   kitten — KittenTTS nano v0.8 (int8), 8 voices, ~24 MB
 *
 * sherpa-onnx needs real file paths, so the assets are unpacked once into
 * filesDir (a marker file skips the copy on later launches). Engine objects
 * are heavy and not thread-safe to build concurrently, hence the lock.
 */
object LocalTts {
  private val lock = Any()
  private var piper: OfflineTts? = null
  private var kitten: OfflineTts? = null

  private const val MARKER_PREFIX = "localtts.v2."

  fun get(ctx: Context, engine: String): OfflineTts = synchronized(lock) {
    when (engine) {
      "kitten" -> kitten ?: buildKitten(ctx).also { kitten = it }
      "piper" -> piper ?: buildPiper(ctx).also { piper = it }
      else -> throw IllegalArgumentException("unknown voice engine: $engine")
    }
  }

  fun numSpeakers(ctx: Context, engine: String): Int =
      runCatching { get(ctx, engine).numSpeakers() }.getOrDefault(1)

  private fun buildPiper(ctx: Context): OfflineTts {
    val dir = ensure(ctx, "piper")
    val config = OfflineTtsConfig(
        model = OfflineTtsModelConfig(
            vits = OfflineTtsVitsModelConfig(
                model = File(dir, "en_US-lessac-low.onnx").absolutePath,
                tokens = File(dir, "tokens.txt").absolutePath,
                dataDir = File(dir, "espeak-ng-data").absolutePath,
            ),
            numThreads = 2,
        ),
        maxNumSentences = 1,
    )
    return OfflineTts(config = config)
  }

  private fun buildKitten(ctx: Context): OfflineTts {
    val dir = ensure(ctx, "kitten")
    val config = OfflineTtsConfig(
        model = OfflineTtsModelConfig(
            kitten = OfflineTtsKittenModelConfig(
                model = File(dir, "model.fp16.onnx").absolutePath,
                voices = File(dir, "voices.bin").absolutePath,
                tokens = File(dir, "tokens.txt").absolutePath,
                dataDir = File(dir, "espeak-ng-data").absolutePath,
            ),
            numThreads = 2,
        ),
        maxNumSentences = 1,
    )
    return OfflineTts(config = config)
  }

  /** Unpack assets/tts/<name> into filesDir/tts/<name> exactly once. */
  private fun ensure(ctx: Context, name: String): File {
    val dir = File(ctx.filesDir, "tts/$name")
    val marker = File(ctx.filesDir, "$MARKER_PREFIX$name")
    if (marker.exists() && dir.isDirectory) return dir
    dir.deleteRecursively()
    dir.mkdirs()
    copyAssetDir(ctx, "tts/$name", dir)
    marker.writeText("ok")
    return dir
  }

  private fun copyAssetDir(ctx: Context, assetPath: String, dest: File) {
    val children = ctx.assets.list(assetPath).orEmpty()
    if (children.isEmpty()) {
      dest.parentFile?.mkdirs()
      ctx.assets.open(assetPath).use { input ->
        dest.outputStream().use { output -> input.copyTo(output) }
      }
      return
    }
    dest.mkdirs()
    for (child in children) copyAssetDir(ctx, "$assetPath/$child", File(dest, child))
  }

  /** 16-bit mono PCM WAV, so the existing MediaPlayer path can play it. */
  fun writeWav(file: File, samples: FloatArray, sampleRate: Int) {
    val dataSize = samples.size * 2
    val out = java.io.ByteArrayOutputStream(44 + dataSize)
    fun le32(v: Int) {
      out.write(v and 0xff)
      out.write((v shr 8) and 0xff)
      out.write((v shr 16) and 0xff)
      out.write((v shr 24) and 0xff)
    }
    fun le16(v: Int) {
      out.write(v and 0xff)
      out.write((v shr 8) and 0xff)
    }
    out.write("RIFF".toByteArray())
    le32(36 + dataSize)
    out.write("WAVE".toByteArray())
    out.write("fmt ".toByteArray())
    le32(16)
    le16(1) // PCM
    le16(1) // mono
    le32(sampleRate)
    le32(sampleRate * 2)
    le16(2)
    le16(16)
    out.write("data".toByteArray())
    le32(dataSize)
    for (s in samples) {
      val v = (s.coerceIn(-1f, 1f) * 32767f).toInt()
      le16(v and 0xffff)
    }
    file.writeBytes(out.toByteArray())
  }

  /** Voice names for KittenTTS nano, in speaker-id order. */
  val KITTEN_VOICES =
      listOf("Bella", "Jasper", "Luna", "Bruno", "Rosie", "Hugo", "Kiki", "Leo")
}
