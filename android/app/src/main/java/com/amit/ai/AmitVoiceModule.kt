package com.amit.ai

import android.content.Intent
import android.media.MediaPlayer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

/**
 * Text-to-speech and speech-to-text, written directly against the Android
 * framework so there is no third-party dependency to rot.
 *
 * JS side: src/lib/voice.ts
 *   NativeModules.AmitVoice.speak(text, rate)
 *   NativeModules.AmitVoice.startListening() / stopListening() / cancel()
 * Events: AmitVoiceResult {text, final} | AmitVoiceError {message} | AmitVoiceEnd
 */
class AmitVoiceModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

  init {
    // Mic arbitration: the wake-word service must let go of the mic while the
    // app is visible, otherwise Google's recogniser cannot record at all.
    ctx.addLifecycleEventListener(object : com.facebook.react.bridge.LifecycleEventListener {
      override fun onHostResume() { MicGate.appVisible = true }
      override fun onHostPause() { MicGate.appVisible = false }
      override fun onHostDestroy() {
        MicGate.appVisible = false
        MicGate.sttActive = false
      }
    })
  }

  private val main = Handler(Looper.getMainLooper())
  private var tts: TextToSpeech? = null
  private var ttsReady = false
  private var recognizer: SpeechRecognizer? = null
  private var player: MediaPlayer? = null

  /**
   * Utterance bookkeeping.
   *
   * Every speak() call carries an id chosen by JS. Only events for the *active*
   * id are forwarded: a flushed/replaced utterance reports onStop(interrupted)
   * one bridge-hop later, and without this filter that stale event would clear
   * the state of the utterance that just started — which made the speaker
   * button flip back to "speak" while audio was still playing.
   */
  private var activeUtterance: String? = null
  private var cloudUtterance: String? = null

  private var ttsEngineName: String = ""
  private var ttsLanguage: String = ""

  init {
    tts = TextToSpeech(ctx) { status ->
      if (status == TextToSpeech.SUCCESS) {
        // The device may have an engine but no voice data for the user's
        // language (this phone has no default synth configured at all). Try the
        // locale, then fall back, and record what actually worked so JS can
        // tell the user instead of playing silence.
        val candidates = listOf(
            Locale.getDefault(),
            Locale.US,
            Locale.ENGLISH,
        )
        var chosen: Locale? = null
        for (loc in candidates) {
          val res = runCatching { tts?.isLanguageAvailable(loc) }.getOrNull() ?: -2
          if (res >= TextToSpeech.LANG_AVAILABLE) {
            runCatching { tts?.language = loc }
            chosen = loc
            break
          }
        }

        ttsEngineName = runCatching { tts?.defaultEngine }.getOrNull() ?: ""
        if (chosen == null) {
          ttsReady = false
          emitError(
              "No voice data for this language. Open Settings › Text-to-speech to install it.",
              "tts",
          )
          return@TextToSpeech
        }
        ttsLanguage = chosen.toLanguageTag()

        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(utteranceId: String?) {
            if (utteranceId != null && utteranceId == activeUtterance) {
              emit("AmitVoiceSpeakingStart", idBundle(utteranceId))
            }
          }

          override fun onDone(utteranceId: String?) = finishUtterance(utteranceId)

          @Deprecated("Deprecated in Java")
          override fun onError(utteranceId: String?) = finishUtterance(utteranceId)

          override fun onStop(utteranceId: String?, interrupted: Boolean) =
              finishUtterance(utteranceId)
        })
        ttsReady = true
      } else {
        ttsReady = false
        emitError(
            "No text-to-speech engine on this phone. Install or enable one in Settings › Text-to-speech.",
            "tts",
        )
      }
    }
  }

  /** What the speech engine actually ended up being. */
  @ReactMethod
  fun ttsStatus(promise: com.facebook.react.bridge.Promise) {
    try {
      val map = Arguments.createMap()
      map.putBoolean("ready", ttsReady)
      map.putString("engine", ttsEngineName)
      map.putString("language", ttsLanguage)
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("tts_status", e)
    }
  }

  /** Open the system text-to-speech screen so voice data can be installed. */
  @ReactMethod
  fun openTtsSettings() {
    main.post {
      val intents = listOf(
          Intent("com.android.settings.TTS_SETTINGS"),
          Intent(android.provider.Settings.ACTION_SETTINGS),
      )
      for (i in intents) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          ctx.startActivity(i)
          return@post
        } catch (_: Exception) {
        }
      }
    }
  }

  private fun idBundle(id: String): Bundle =
      Bundle().apply { putString("id", id) }

  /** Report the end of an utterance once, and only if it is still the active one. */
  private fun finishUtterance(id: String?) {
    if (id == null || id != activeUtterance) return
    activeUtterance = null
    emit("AmitVoiceSpeakingEnd", idBundle(id))
  }

  override fun getName() = "AmitVoice"

  private fun emit(event: String, payload: Bundle?) {
    if (!ctx.hasActiveReactInstance()) return
    val map = Arguments.createMap()
    payload?.keySet()?.forEach { key ->
      when (val v = payload.get(key)) {
        is String -> map.putString(key, v)
        is Boolean -> map.putBoolean(key, v)
        else -> map.putString(key, v?.toString() ?: "")
      }
    }
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(event, map)
  }

  private fun emitText(text: String, final: Boolean) {
    if (!ctx.hasActiveReactInstance()) return
    val map = Arguments.createMap()
    map.putString("text", text)
    map.putBoolean("final", final)
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("AmitVoiceResult", map)
  }

  /**
   * `source` tells JS which subsystem failed: "stt" or "tts". Both used to be
   * bare AmitVoiceError events, so a recogniser silence timeout was mistaken
   * for the spoken answer failing and cut the conversation short.
   */
  private fun emitError(message: String, source: String, code: Int? = null, id: String? = null) {
    if (!ctx.hasActiveReactInstance()) return
    val map = Arguments.createMap()
    map.putString("message", message)
    map.putString("source", source)
    if (code != null) map.putInt("code", code)
    if (id != null) map.putString("id", id)
    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("AmitVoiceError", map)
  }

  /* ----------------------- large JSON storage ------------------------- */

  /**
   * Store a large JSON blob on the app-private external files dir
   * (/sdcard/Android/data/com.amit.ai/files/amitai/).
   *
   * This directory is app-private on Android 10+ (scoped storage), so no
   * WRITE_EXTERNAL_STORAGE permission is needed. It survives app restarts and
   * is far larger than SharedPreferences or AsyncStorage's SQLite ceiling.
   *
   * Used for conversation transcripts when the user enables SD-card storage in
   * Settings.
   */
  @ReactMethod
  fun saveLargeJson(key: String, value: String, promise: com.facebook.react.bridge.Promise) {
    try {
      val dir = storageDir()
      if (!dir.exists()) dir.mkdirs()
      val file = java.io.File(dir, key)
      file.outputStream().use { out ->
        out.write(value.toByteArray(Charsets.UTF_8))
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("large_write", e)
    }
  }

  @ReactMethod
  fun loadLargeJson(key: String, promise: com.facebook.react.bridge.Promise) {
    try {
      val dir = storageDir()
      if (!dir.exists()) {
        promise.resolve(null)
        return
      }
      val actual = java.io.File(dir, key)
      if (!actual.exists() || !actual.isFile) {
        // one-time move from the old app-private "amitai" folder
        val old = java.io.File(legacyDir(), key)
        if (old.exists() && old.isFile) {
          try {
            old.copyTo(actual, overwrite = true)
            old.delete()
          } catch (_: Exception) {
          }
        }
      }
      if (!actual.exists() || !actual.isFile) {
        promise.resolve(null)
        return
      }
      val text = actual.readText(Charsets.UTF_8)
      promise.resolve(if (text.isBlank()) null else text)
    } catch (e: Exception) {
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun deleteLargeJson(key: String, promise: com.facebook.react.bridge.Promise) {
    try {
      val file = java.io.File(storageDir(), key)
      if (file.exists()) file.delete()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("large_delete", e)
    }
  }

  @ReactMethod
  fun hasLargeStorage(promise: com.facebook.react.bridge.Promise) {
    try {
      val dir = storageDir()
      promise.resolve(dir.canWrite())
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  /* ---------------------------- chat storage -------------------------- */

  /**
   * /sdcard/AmitAI when All-files access is granted (visible in any file
   * manager), otherwise Android/data/com.amit.ai/files/AmitAI which is always
   * writable and needs no permission.
   */
  private fun storageDir(): java.io.File {
    if (android.os.Build.VERSION.SDK_INT >= 30) {
      if (android.os.Environment.isExternalStorageManager()) {
        val root = java.io.File(android.os.Environment.getExternalStorageDirectory(), "AmitAI")
        if (root.exists() || root.mkdirs()) return root
      }
    } else {
      val root = java.io.File(android.os.Environment.getExternalStorageDirectory(), "AmitAI")
      if (root.exists() || root.mkdirs()) return root
    }
    return java.io.File(ctx.getExternalFilesDir(null), "AmitAI").apply { mkdirs() }
  }

  private fun legacyDir() = java.io.File(ctx.getExternalFilesDir(null), "amitai")

  @ReactMethod
  fun storageInfo(promise: com.facebook.react.bridge.Promise) {
    try {
      val dir = storageDir()
      val m = com.facebook.react.bridge.Arguments.createMap()
      m.putString("path", dir.absolutePath)
      m.putBoolean(
          "legacy",
          android.os.Build.VERSION.SDK_INT < 30 || android.os.Environment.isExternalStorageManager()
      )
      m.putBoolean("writable", dir.canWrite())
      m.putDouble("freeMb", (dir.usableSpace / (1024 * 1024)).toDouble())
      promise.resolve(m)
    } catch (e: Exception) {
      promise.reject("storage_info", e)
    }
  }

  @ReactMethod
  fun requestAllFiles(promise: com.facebook.react.bridge.Promise) {
    try {
      if (android.os.Build.VERSION.SDK_INT >= 30) {
        val i = Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
        i.data = android.net.Uri.parse("package:" + ctx.packageName)
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(i)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("all_files", e)
    }
  }

  /* ------------------------------- TTS -------------------------------- */

  @ReactMethod
  fun speak(text: String, rate: Double, utteranceId: String) {
    if (!ttsReady) {
      // Report the failure first: the end event settles the utterance as
      // finished, and JS would then treat the silence as a spoken answer.
      emitError(
          "Text-to-speech is not ready on this phone. Settings › Text-to-speech to fix it.",
          "tts",
          id = utteranceId,
      )
      // Also end it, so the UI does not stay in the "stop" state waiting for
      // an end that will never come.
      emit("AmitVoiceSpeakingEnd", idBundle(utteranceId))
      return
    }
    if (text.isBlank()) {
      emit("AmitVoiceSpeakingEnd", idBundle(utteranceId))
      return
    }
    activeUtterance = utteranceId
    tts?.setSpeechRate(rate.toFloat())
    val queued = tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
    if (queued == TextToSpeech.ERROR) {
      // Say it instead of playing silence: the engine accepted the call and
      // then refused, which would otherwise leave the UI waiting forever.
      activeUtterance = null
      emitError(
          "The voice engine could not speak. Open Settings › Text-to-speech to fix it.",
          "tts",
          id = utteranceId,
      )
      emit("AmitVoiceSpeakingEnd", idBundle(utteranceId))
    }
  }

  @ReactMethod
  fun stopSpeaking() {
    val id = activeUtterance
    activeUtterance = null
    tts?.stop()
    if (id != null) emit("AmitVoiceSpeakingEnd", idBundle(id))
  }

  /* --------------------------- cloud TTS (ElevenLabs) -------------------- */

  private fun stopMedia() {
    player?.let { p ->
      try { p.stop() } catch (_: Exception) {}
      try { p.release() } catch (_: Exception) {}
    }
    player = null
  }

  @ReactMethod
  fun stopCloud() {
    main.post {
      // Only report an end when something was actually playing. Emitting on an
      // idle player used to cancel the state of a *different* speech that had
      // just been started.
      val id = cloudUtterance
      cloudUtterance = null
      stopMedia()
      if (id != null) emit("AmitVoiceSpeakingEnd", idBundle(id))
    }
  }

  /**
   * Fetch speech from ElevenLabs and play it.
   *
   * Done here rather than in JS because the response is audio bytes and the
   * request needs an `xi-api-key` header — MediaPlayer can play a local file,
   * not an authenticated stream.
   */
  @ReactMethod
  fun speakCloud(
    text: String,
    apiKey: String,
    voiceId: String,
    model: String,
    speed: Double,
    utteranceId: String,
    promise: com.facebook.react.bridge.Promise,
  ) {
    main.post {
      stopMedia()
      cloudUtterance = utteranceId
    }

    Thread {
      var file: java.io.File? = null
      try {
        val endpoint =
            "https://api.elevenlabs.io/v1/text-to-speech/$voiceId?output_format=mp3_22050_32"
        val conn = (java.net.URL(endpoint).openConnection() as java.net.HttpURLConnection).apply {
          requestMethod = "POST"
          doOutput = true
          connectTimeout = 20000
          readTimeout = 40000
          setRequestProperty("xi-api-key", apiKey)
          setRequestProperty("Content-Type", "application/json")
          setRequestProperty("Accept", "audio/mpeg")
        }

        val vs = org.json.JSONObject()
            .put("stability", 0.45)
            .put("similarity_boost", 0.8)
        if (speed > 0.0) vs.put("speed", speed)
        val body = org.json.JSONObject()
            .put("text", text)
            .put("model_id", model)
            .put("voice_settings", vs)
            .toString()

        conn.outputStream.use { it.write(body.toByteArray()) }

        val code = conn.responseCode
        if (code !in 200..299) {
          val msg = conn.errorStream?.bufferedReader()?.readText().orEmpty().take(240)
          conn.disconnect()
          promise.reject("elevenlabs_http_$code", msg)
          return@Thread
        }

        val out = java.io.File(ctx.cacheDir, "tts_${System.currentTimeMillis()}.mp3")
        conn.inputStream.use { input -> out.outputStream().use { input.copyTo(it) } }
        conn.disconnect()
        file = out

        main.post {
          try {
            stopMedia()
            val mp = MediaPlayer()
            mp.setDataSource(out.absolutePath)
            mp.setOnCompletionListener {
              it.release()
              if (player === it) player = null
              out.delete()
              if (cloudUtterance == utteranceId) {
                cloudUtterance = null
                emit("AmitVoiceSpeakingEnd", idBundle(utteranceId))
              }
            }
            mp.prepare()
            mp.start()
            player = mp
            emit("AmitVoiceSpeakingStart", idBundle(utteranceId))
            promise.resolve(true)
          } catch (e: Exception) {
            promise.reject("elevenlabs_playback", e)
          }
        }
      } catch (e: Exception) {
        file?.delete()
        promise.reject("elevenlabs_network", e)
      }
    }.start()
  }

  /* ------------------------- settings storage --------------------------- */

  /**
   * Plain SharedPreferences, used as the source of truth for settings.
   *
   * AsyncStorage (v3) on Android sits behind an encrypted keychain; if the
   * Keystore entry is lost the whole key/value store comes back empty and the
   * app silently falls back to defaults. SharedPreferences has no such layer.
   */
  private fun prefs() =
      ctx.getSharedPreferences("amitai", android.content.Context.MODE_PRIVATE)

  @ReactMethod
  fun saveJson(key: String, value: String, promise: com.facebook.react.bridge.Promise) {
    try {
      prefs().edit().putString(key, value).commit()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("prefs_write", e)
    }
  }

  @ReactMethod
  fun loadJson(key: String, promise: com.facebook.react.bridge.Promise) {
    try {
      promise.resolve(prefs().getString(key, null))
    } catch (e: Exception) {
      promise.resolve(null)
    }
  }

  /* ----------------------------- clipboard ------------------------------ */

  @ReactMethod
  fun setClipboard(text: String, promise: com.facebook.react.bridge.Promise) {
    try {
      val cm = ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE)
          as android.content.ClipboardManager
      cm.setPrimaryClip(android.content.ClipData.newPlainText("AmitAI", text))
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("clipboard_failed", e)
    }
  }

  @ReactMethod
  fun getClipboard(promise: com.facebook.react.bridge.Promise) {
    try {
      val cm = ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE)
          as android.content.ClipboardManager
      val clip = cm.primaryClip
      val text = if (clip != null && clip.itemCount > 0) clip.getItemAt(0).coerceToText(ctx).toString() else ""
      promise.resolve(text)
    } catch (e: Exception) {
      promise.resolve("")
    }
  }

  @ReactMethod
  fun isSpeaking(promise: com.facebook.react.bridge.Promise) {
    promise.resolve(ttsReady && tts?.isSpeaking == true)
  }

  /* ------------------------------- STT -------------------------------- */

  private val listener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) {
      sttAttempt = 0
    }
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}

    override fun onError(error: Int) {
      if (sttAttempt < 3 && (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ||
          error == SpeechRecognizer.ERROR_AUDIO || error == SpeechRecognizer.ERROR_CLIENT)) {
        retryOrFail("Recognizer busy", error)
        return
      }
      MicGate.sttActive = false
      val msg = when (error) {
        SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Timed out waiting for speech"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission denied"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Recognizer needs a network connection"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
        else -> "Speech error $error"
      }
      emitError(msg, "stt", error)
      emit("AmitVoiceEnd", null)
    }

    override fun onResults(results: Bundle?) {
      MicGate.sttActive = false
      val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
          ?.firstOrNull().orEmpty()
      if (text.isNotEmpty()) emitText(text, true)
      emit("AmitVoiceEnd", null)
    }

    override fun onPartialResults(partialResults: Bundle?) {
      val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
          ?.firstOrNull().orEmpty()
      if (text.isNotEmpty()) emitText(text, false)
    }

    override fun onEvent(eventType: Int, params: Bundle?) {}
  }

  private var sttAttempt = 0

  @ReactMethod
  fun startListening() {
    main.post {
      MicGate.sttActive = true
      listenInternal()
    }
  }

  /** Bind the recogniser early so the first tap does not pay service-startup cost. */
  @ReactMethod
  fun warmUp() {
    main.post {
      if (SpeechRecognizer.isRecognitionAvailable(ctx) && recognizer == null) {
        recognizer = SpeechRecognizer.createSpeechRecognizer(ctx).also {
          it.setRecognitionListener(listener)
        }
      }
    }
  }

  private fun listenInternal() {
    if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
      MicGate.sttActive = false
      emitError("No speech recognizer on this device", "stt")
      return
    }
    // Do NOT stop playback here. The mic is opened *during* an answer on
    // purpose (barge-in), and this call also runs again on every recogniser
    // retry — which silently killed the answer a few hundred milliseconds in.
    // JS owns the speech lifecycle and stops it only when the user interrupts.

    if (recognizer == null) {
      recognizer = SpeechRecognizer.createSpeechRecognizer(ctx).also {
        it.setRecognitionListener(listener)
      }
    }
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
      // Snappier endpoints: short silence closes a sentence sooner, which is
      // what makes hands-free conversation feel immediate.
      putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 900L)
      putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 500L)
      putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 500L)
    }
    try {
      recognizer?.startListening(intent)
    } catch (e: Exception) {
      retryOrFail(e.message ?: "Could not start listening", SpeechRecognizer.ERROR_AUDIO)
    }
  }

  /**
   * Google's service is occasionally still releasing the mic (another app, the
   * previous session, TTS). Retry quickly instead of surfacing "Recognizer
   * busy" as a hard error.
   */
  private fun retryOrFail(msg: String, code: Int) {
    if (sttAttempt < 3 && (code == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ||
        code == SpeechRecognizer.ERROR_AUDIO || code == SpeechRecognizer.ERROR_CLIENT)) {
      sttAttempt++
      main.postDelayed({ if (MicGate.sttActive) listenInternal() }, 300L)
      return
    }
    MicGate.sttActive = false
    emitError(msg, "stt", code)
    emit("AmitVoiceEnd", null)
  }

  @ReactMethod
  fun stopListening() {
    main.post {
      runCatching { recognizer?.stopListening() }
      MicGate.sttActive = false
      sttAttempt = 0
    }
  }

  @ReactMethod
  fun cancelListening() {
    main.post {
      runCatching { recognizer?.cancel() }
      MicGate.sttActive = false
      sttAttempt = 0
    }
  }

  override fun invalidate() {
    main.post {
      runCatching { recognizer?.destroy() }
      recognizer = null
      stopMedia()
      tts?.stop()
      tts?.shutdown()
      tts = null
      ttsReady = false
    }
    super.invalidate()
  }
}
