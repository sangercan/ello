package com.ellosocial.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class ElloFirebaseMessagingService extends FirebaseMessagingService {

    private static final String CALLS_CHANNEL_ID = "ello_calls";
    private static final String CALLS_CHANNEL_NAME = "Ello Chamadas";
    private static final String CALLS_CHANNEL_DESCRIPTION = "Alertas de chamadas recebidas";
    private static final int CALL_NOTIFICATION_BASE_ID = 700000;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);

        final Map<String, String> data = remoteMessage.getData();
        if (data == null || data.isEmpty()) return;

        final String type = String.valueOf(data.get("type")).trim().toLowerCase();
        if ("incoming_call".equals(type)) {
            showIncomingCallNotification(remoteMessage, data);
            return;
        }

        if (isCallControlType(type)) {
            dismissIncomingCallNotification(data.get("call_id"));
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }

    private void showIncomingCallNotification(@NonNull RemoteMessage remoteMessage, @NonNull Map<String, String> data) {
        ensureCallsChannel();

        final String title = firstNonEmpty(
            data.get("title"),
            remoteMessage.getNotification() != null ? remoteMessage.getNotification().getTitle() : null,
            "Chamada recebida"
        );
        final String body = firstNonEmpty(
            data.get("body"),
            remoteMessage.getNotification() != null ? remoteMessage.getNotification().getBody() : null,
            "Alguem esta ligando para voce"
        );

        final int notificationId = resolveCallNotificationId(data.get("call_id"));

        final Intent callIntent = new Intent(this, MainActivity.class);
        callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            callIntent.putExtra(entry.getKey(), entry.getValue());
        }
        final String messageId = remoteMessage.getMessageId();
        if (!TextUtils.isEmpty(messageId)) {
            callIntent.putExtra("google.message_id", messageId);
        }

        final int pendingFlags =
            PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        final PendingIntent contentIntent = PendingIntent.getActivity(this, notificationId, callIntent, pendingFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALLS_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(true)
            .setTimeoutAfter(60_000)
            .setContentIntent(contentIntent)
            .setFullScreenIntent(contentIntent, true)
            .setVibrate(new long[] {0, 300, 250, 300, 250, 450});

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(getRawSoundUri("recebida"));
        }

        NotificationManagerCompat.from(this).notify(notificationId, builder.build());
    }

    private void ensureCallsChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationChannel existing = manager.getNotificationChannel(CALLS_CHANNEL_ID);
        if (existing != null) return;

        NotificationChannel channel = new NotificationChannel(
            CALLS_CHANNEL_ID,
            CALLS_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(CALLS_CHANNEL_DESCRIPTION);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] {0, 300, 250, 300, 250, 450});
        channel.setSound(
            getRawSoundUri("recebida"),
            new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build()
        );

        manager.createNotificationChannel(channel);
    }

    private Uri getRawSoundUri(@NonNull String rawName) {
        return Uri.parse("android.resource://" + getPackageName() + "/raw/" + rawName);
    }

    private boolean isCallControlType(@NonNull String type) {
        return "call_ended".equals(type)
            || "call_missed".equals(type)
            || "call_rejected".equals(type)
            || "call_busy".equals(type)
            || "call_canceled".equals(type)
            || "call_cancelled".equals(type);
    }

    private void dismissIncomingCallNotification(String callIdRaw) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(this);
        manager.cancel(resolveCallNotificationId(callIdRaw));
        // Fallback to base id in case call_id is missing in payload.
        manager.cancel(CALL_NOTIFICATION_BASE_ID);
    }

    private int resolveCallNotificationId(String callIdRaw) {
        try {
            if (callIdRaw == null) return CALL_NOTIFICATION_BASE_ID;
            int callId = Integer.parseInt(callIdRaw);
            if (callId < 0) return CALL_NOTIFICATION_BASE_ID;
            return CALL_NOTIFICATION_BASE_ID + callId;
        } catch (NumberFormatException ignored) {
            return CALL_NOTIFICATION_BASE_ID;
        }
    }

    @NonNull
    private String firstNonEmpty(String... values) {
        for (String value : values) {
            if (!TextUtils.isEmpty(value)) {
                return value;
            }
        }
        return "";
    }
}
