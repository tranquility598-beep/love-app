package com.example.love_mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Сервис, удерживающий процесс во время захвата экрана в фоне.
 *
 * Его можно стартовать ИСКЛЮЧИТЕЛЬНО после успешного getDisplayMedia:
 * к этому моменту flutter_webrtc уже получил пользовательский MediaProjection
 * token. Android 14–16 проверяет этот token, когда сервис получает тип
 * mediaProjection.
 */
class ScreenShareForegroundService : Service() {
    companion object {
        const val CHANNEL_ID = "love_screen_share"
        const val NOTIFICATION_ID = 0x4C56
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createNotificationChannel()
        val notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle("LOVE")
            .setContentText("Идёт демонстрация экрана")
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
                )
            } else {
                @Suppress("DEPRECATION")
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (_: SecurityException) {
            // Нельзя давать исключению уйти из onStartCommand: Android иначе
            // роняет всё приложение. Захват уже стартовал через WebRTC и
            // продолжит работать на переднем плане; повторный запуск FGS
            // можно сделать при следующем разворачивании приложения.
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Демонстрация экрана",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Уведомление во время демонстрации экрана LOVE"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
