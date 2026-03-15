package com.ellosocial.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.IBinder;
import android.text.TextUtils;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class CallForegroundService extends Service {
    public static final String ACTION_START = "com.ellosocial.app.call.foreground.START";
    public static final String ACTION_UPDATE = "com.ellosocial.app.call.foreground.UPDATE";
    public static final String ACTION_STOP = "com.ellosocial.app.call.foreground.STOP";

    public static final String EXTRA_CALL_ID = "extra_call_id";
    public static final String EXTRA_TITLE = "extra_title";
    public static final String EXTRA_SUBTITLE = "extra_subtitle";
    public static final String EXTRA_AVATAR_URL = "extra_avatar_url";
    public static final String EXTRA_IS_VIDEO = "extra_is_video";

    private static final String CHANNEL_ID = "ello_ongoing_call";
    private static final String CHANNEL_NAME = "Ello Social Chamada em andamento";
    private static final String CHANNEL_DESCRIPTION = "Mantem chamadas ativas em segundo plano";
    private static final int NOTIFICATION_ID = 710001;
    private static final String DEFAULT_TITLE = "Chamada em andamento";
    private static final String DEFAULT_SUBTITLE = "Ello Social";

    private int callId = -1;
    private String title = DEFAULT_TITLE;
    private String subtitle = DEFAULT_SUBTITLE;
    private String avatarUrl = "";
    private boolean isVideo = false;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        final String action = intent != null ? intent.getAction() : ACTION_START;

        if (ACTION_STOP.equals(action)) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        applyExtras(intent);
        ensureChannel();
        startForegroundCompat(buildNotification());
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void applyExtras(@Nullable Intent intent) {
        if (intent == null) return;

        if (intent.hasExtra(EXTRA_CALL_ID)) {
            callId = intent.getIntExtra(EXTRA_CALL_ID, callId);
        }

        String titleRaw = intent.getStringExtra(EXTRA_TITLE);
        if (!TextUtils.isEmpty(titleRaw)) {
            title = titleRaw;
        }

        String subtitleRaw = intent.getStringExtra(EXTRA_SUBTITLE);
        if (!TextUtils.isEmpty(subtitleRaw)) {
            subtitle = subtitleRaw;
        }

        if (intent.hasExtra(EXTRA_AVATAR_URL)) {
            String avatarUrlRaw = intent.getStringExtra(EXTRA_AVATAR_URL);
            avatarUrl = TextUtils.isEmpty(avatarUrlRaw) ? "" : avatarUrlRaw;
        }

        if (intent.hasExtra(EXTRA_IS_VIDEO)) {
            isVideo = intent.getBooleanExtra(EXTRA_IS_VIDEO, isVideo);
        }
    }

    private Notification buildNotification() {
        final Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_SINGLE_TOP |
            Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        if (callId >= 0) {
            launchIntent.putExtra("call_id", callId);
        }
        launchIntent.putExtra(CallNotificationsPlugin.EXTRA_CALL_ACTION, CallNotificationsPlugin.ACTION_OPEN);
        launchIntent.putExtra(CallNotificationsPlugin.EXTRA_FROM_CALL_NOTIFICATION, true);

        final int pendingFlags =
            PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        final PendingIntent openCallIntent = PendingIntent.getActivity(this, NOTIFICATION_ID, launchIntent, pendingFlags);

        final String subtitleText = TextUtils.isEmpty(subtitle)
            ? (isVideo ? "Chamada de video ativa" : "Chamada de voz ativa")
            : subtitle;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_ello)
            .setContentTitle(TextUtils.isEmpty(title) ? DEFAULT_TITLE : title)
            .setContentText(subtitleText)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openCallIntent)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);

        Bitmap avatarBitmap = AvatarBitmapFetcher.load(avatarUrl, 128);
        if (avatarBitmap != null) {
            builder.setLargeIcon(avatarBitmap);
        }

        return builder.build();
    }

    private void startForegroundCompat(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL | ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            if (isVideo) {
                serviceType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
            }
            startForeground(NOTIFICATION_ID, notification, serviceType);
            return;
        }

        startForeground(NOTIFICATION_ID, notification);
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel channel = manager.getNotificationChannel(CHANNEL_ID);
        if (channel != null) return;

        channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(CHANNEL_DESCRIPTION);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.enableLights(false);
        manager.createNotificationChannel(channel);
    }
}
