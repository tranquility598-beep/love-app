package com.example.love_mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * Foreground-сервис типа mediaProjection для демонстрации экрана.
 *
 * ВАЖНО: этот сервис можно стартовать ТОЛЬКО после того, как пользователь
 * дал согласие в системном диалоге (Helper.requestCapturePermission()
 * на стороне Dart). Иначе Android 14+ бросит SecurityException прямо
 * на startForegroundService.
 *
 * startForeground() вызывается сразу в onStartCommand, и через onStarted
 * мы сообщаем MainActivity, что можно продолжать (вызывать getDisplayMedia).
 */
class ScreenShareService : Service() {

    companion object {
        private const val TAG = "ScreenShareService"
        private const val CHANNEL_ID = "love_screen_share"
        private const val NOTIFICATION_ID = 4207

        @Volatile
        var isRunning: Boolean = false
            private set

        /** Одноразовый колбэк: true = startForeground успешен. */
        @Volatile
        var onStarted: ((Boolean) -> Unit)? = null

        private fun consumeOnStarted(success: Boolean) {
            val cb = onStarted
            onStarted = null
            cb?.invoke(success)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ScreenShareService::class.java))
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createNotificationChannel()
        val notification = buildNotification()
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            isRunning = true
            Log.i(TAG, "Screen share FGS started (type=mediaProjection)")
            consumeOnStarted(true)
            START_NOT_STICKY
        } catch (e: Exception) {
            // Сюда попадём, если согласие ещё не выдано (нарушен порядок)
            // или отсутствует разрешение в манифесте.
            Log.e(TAG, "startForeground failed: ${e.message}", e)
            isRunning = false
            consumeOnStarted(false)
            stopSelf()
            START_NOT_STICKY
        }
    }

    override fun onDestroy() {
        isRunning = false
        Log.i(TAG, "Screen share FGS stopped")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Демонстрация экрана",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Активная демонстрация экрана в LOVE"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentIntent = if (launchIntent != null) {
            PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else null

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("LOVE — демонстрация экрана")
            .setContentText("Вы делитесь экраном")
            .setSmallIcon(applicationInfo.icon)
            .setOngoing(true)
            .apply { contentIntent?.let { setContentIntent(it) } }
            .build()
    }
}
