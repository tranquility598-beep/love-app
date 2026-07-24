package com.example.love_mobile

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterActivity() {
    private val audioPickerChannel = "love_mobile/audio_picker"
    private val screenShareChannel = "love_mobile/screen_share_service"
    private val audioPickerRequestCode = 41721
    private val filePickerRequestCode = 41722
    private var pendingAudioResult: MethodChannel.Result? = null
    private var activeVoiceRecorder: MediaRecorder? = null
    private var activeVoiceFile: File? = null
    private var activeVoiceStartedAt: Long = 0

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, audioPickerChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "pickAudio" -> pickAudio(result)
                    "pickFile" -> pickFile(result)
                    "startVoiceRecording" -> startVoiceRecording(result)
                    "stopVoiceRecording" -> stopVoiceRecording(result)
                    "cancelVoiceRecording" -> cancelVoiceRecording(result)
                    else -> result.notImplemented()
                }
            }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, screenShareChannel)
            .setMethodCallHandler { call, result ->
                try {
                    when (call.method) {
                        "start" -> {
                            val intent = Intent(this, ScreenShareForegroundService::class.java)
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                startForegroundService(intent)
                            } else {
                                startService(intent)
                            }
                            result.success(null)
                        }
                        "stop" -> {
                            stopService(Intent(this, ScreenShareForegroundService::class.java))
                            result.success(null)
                        }
                        else -> result.notImplemented()
                    }
                } catch (error: Exception) {
                    result.error("screen_share_service", error.message, null)
                }
            }
    }

    private fun pickAudio(result: MethodChannel.Result) {
        if (pendingAudioResult != null) {
            result.error("busy", "Audio picker is already open", null)
            return
        }
        pendingAudioResult = result
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "audio/*"
        }
        try {
            startActivityForResult(intent, audioPickerRequestCode)
        } catch (error: Exception) {
            pendingAudioResult = null
            result.error("open_failed", error.message, null)
        }
    }

    private fun pickFile(result: MethodChannel.Result) {
        if (pendingAudioResult != null) {
            result.error("busy", "File picker is already open", null)
            return
        }
        pendingAudioResult = result
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
        }
        try {
            startActivityForResult(intent, filePickerRequestCode)
        } catch (error: Exception) {
            pendingAudioResult = null
            result.error("open_failed", error.message, null)
        }
    }

    private fun startVoiceRecording(result: MethodChannel.Result) {
        if (activeVoiceRecorder != null) {
            result.error("busy", "Voice recording is already active", null)
            return
        }
        try {
            val dir = File(cacheDir, "voice_messages").apply { mkdirs() }
            val outFile = File(dir, "voice_${System.currentTimeMillis()}.m4a")
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setAudioEncodingBitRate(64000)
            recorder.setAudioSamplingRate(44100)
            recorder.setOutputFile(outFile.absolutePath)
            recorder.prepare()
            recorder.start()
            activeVoiceRecorder = recorder
            activeVoiceFile = outFile
            activeVoiceStartedAt = System.currentTimeMillis()
            result.success(mapOf("path" to outFile.absolutePath))
        } catch (error: Exception) {
            activeVoiceRecorder?.release()
            activeVoiceRecorder = null
            activeVoiceFile = null
            activeVoiceStartedAt = 0
            result.error("record_failed", error.message, null)
        }
    }

    private fun stopVoiceRecording(result: MethodChannel.Result) {
        val recorder = activeVoiceRecorder
        val file = activeVoiceFile
        if (recorder == null || file == null) {
            result.success(null)
            return
        }
        val durationMs = System.currentTimeMillis() - activeVoiceStartedAt
        try {
            recorder.stop()
            recorder.release()
            activeVoiceRecorder = null
            activeVoiceFile = null
            activeVoiceStartedAt = 0
            result.success(
                mapOf(
                    "path" to file.absolutePath,
                    "name" to file.name,
                    "mimeType" to "audio/mp4",
                    "durationMs" to durationMs,
                    "size" to file.length()
                )
            )
        } catch (error: Exception) {
            recorder.release()
            activeVoiceRecorder = null
            activeVoiceFile = null
            activeVoiceStartedAt = 0
            file.delete()
            result.error("record_failed", error.message, null)
        }
    }

    private fun cancelVoiceRecording(result: MethodChannel.Result) {
        try {
            activeVoiceRecorder?.stop()
        } catch (_: Exception) {
        }
        activeVoiceRecorder?.release()
        activeVoiceRecorder = null
        activeVoiceFile?.delete()
        activeVoiceFile = null
        activeVoiceStartedAt = 0
        result.success(null)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != audioPickerRequestCode && requestCode != filePickerRequestCode) return
        val result = pendingAudioResult ?: return
        pendingAudioResult = null
        if (resultCode != Activity.RESULT_OK) {
            result.success(null)
            return
        }
        val uri = data?.data
        if (uri == null) {
            result.success(null)
            return
        }
        try {
            val name = displayName(uri)
            val safeName = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
            val dir = File(
                cacheDir,
                if (requestCode == audioPickerRequestCode) "audio_uploads" else "file_uploads"
            ).apply { mkdirs() }
            val outFile = File(dir, "${System.currentTimeMillis()}_$safeName")
            contentResolver.openInputStream(uri).use { input ->
                if (input == null) throw IllegalStateException("Cannot open selected audio")
                FileOutputStream(outFile).use { output -> input.copyTo(output) }
            }
            result.success(
                mapOf(
                    "path" to outFile.absolutePath,
                    "name" to name,
                    "mimeType" to (contentResolver.getType(uri) ?: ""),
                    "size" to outFile.length()
                )
            )
        } catch (error: Exception) {
            result.error("copy_failed", error.message, null)
        }
    }

    private fun displayName(uri: Uri): String {
        var name = "audio"
        val cursor: Cursor? = contentResolver.query(
            uri,
            arrayOf(OpenableColumns.DISPLAY_NAME),
            null,
            null,
            null
        )
        cursor.use {
            if (it != null && it.moveToFirst()) {
                val index = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) name = it.getString(index) ?: name
            }
        }
        return name
    }
}
