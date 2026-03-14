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
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class ElloFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "ElloFcmService";
    private static final String GENERAL_CHANNEL_ID = "ello_general";
    private static final String GENERAL_CHANNEL_NAME = "Ello Notificacoes";
    private static final String GENERAL_CHANNEL_DESCRIPTION = "Notificacoes gerais do Ello";
    private static final int GENERAL_NOTIFICATION_BASE_ID = 810000;
    private static final String CALLS_CHANNEL_ID = "ello_calls";
    private static final String CALLS_CHANNEL_NAME = "Ello Chamadas";
    private static final String CALLS_CHANNEL_DESCRIPTION = "Alertas de chamadas recebidas";
    private static final int CALL_NOTIFICATION_BASE_ID = 700000;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        try {
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
        } catch (Exception exception) {
            Log.w(TAG, "Failed to forward remote message to Capacitor plugin", exception);
        }

        final Map<String, String> data = remoteMessage.getData();
        if (data == null || data.isEmpty()) return;

        final String type = String.valueOf(data.get("type")).trim().toLowerCase();
        if ("incoming_call".equals(type)) {
            showIncomingCallNotification(remoteMessage, data);
            return;
        }

        if (isCallControlType(type)) {
            dismissIncomingCallNotification(data.get("call_id"));
            return;
        }

        maybeShowFallbackDataNotification(remoteMessage, data);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        try {
            PushNotificationsPlugin.onNewToken(token);
        } catch (Exception exception) {
            Log.w(TAG, "Failed to forward FCM token to Capacitor plugin", exception);
        }
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

        final String messageId = remoteMessage.getMessageId();
        final Intent callIntent = new Intent(this, MainActivity.class);
        callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        attachCallPayloadExtras(callIntent, data, messageId, notificationId, CallNotificationsPlugin.ACTION_ANSWER);

        final int pendingFlags =
            PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        final PendingIntent contentIntent = PendingIntent.getActivity(this, notificationId, callIntent, pendingFlags);
        final PendingIntent declineIntent = buildCallActionIntent(notificationId + 1, data, messageId, notificationId, CallNotificationsPlugin.ACTION_DECLINE);
        final PendingIntent answerIntent = buildCallActionIntent(notificationId + 2, data, messageId, notificationId, CallNotificationsPlugin.ACTION_ANSWER);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALLS_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_ello)
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
            .addAction(R.drawable.ic_stat_ello, "Recusar", declineIntent)
            .addAction(R.drawable.ic_stat_ello, "Atender", answerIntent)
            .setVibrate(new long[] {0, 300, 250, 300, 250, 450});

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(getRawSoundUri("recebida"));
        }

        NotificationManagerCompat.from(this).notify(notificationId, builder.build());
    }

    @NonNull
    private PendingIntent buildCallActionIntent(
        int requestCode,
        @NonNull Map<String, String> data,
        String messageId,
        int notificationId,
        @NonNull String action
    ) {
        Intent intent = new Intent(this, CallNotificationActionReceiver.class);
        intent.setAction("com.ellosocial.app.call_action." + action + "." + requestCode);
        attachCallPayloadExtras(intent, data, messageId, notificationId, action);
        final int pendingFlags =
            PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(this, requestCode, intent, pendingFlags);
    }

    private void attachCallPayloadExtras(
        @NonNull Intent targetIntent,
        @NonNull Map<String, String> data,
        String messageId,
        int notificationId,
        @NonNull String action
    ) {
        for (Map.Entry<String, String> entry : data.entrySet()) {
            targetIntent.putExtra(entry.getKey(), entry.getValue());
        }
        if (!TextUtils.isEmpty(messageId)) {
            targetIntent.putExtra("google.message_id", messageId);
        }
        targetIntent.putExtra(CallNotificationsPlugin.EXTRA_CALL_ACTION, action);
        targetIntent.putExtra(CallNotificationsPlugin.EXTRA_CALL_NOTIFICATION_ID, notificationId);
        targetIntent.putExtra(CallNotificationsPlugin.EXTRA_FROM_CALL_NOTIFICATION, true);
    }

    private void maybeShowFallbackDataNotification(@NonNull RemoteMessage remoteMessage, @NonNull Map<String, String> data) {
        // Normal notification payloads are handled by Android system tray while app is backgrounded.
        // This fallback is for data-only pushes (for example, custom message payloads).
        if (remoteMessage.getNotification() != null) return;

        final String title = firstNonEmpty(data.get("title"), "Ello");
        final String body = firstNonEmpty(data.get("body"), data.get("message"), data.get("content"));
        if (TextUtils.isEmpty(body)) return;

        ensureGeneralChannel();

        final int notificationId = resolveGeneralNotificationId(data, remoteMessage);
        final Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            intent.putExtra(entry.getKey(), entry.getValue());
        }

        final int pendingFlags =
            PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        final PendingIntent contentIntent = PendingIntent.getActivity(this, notificationId, intent, pendingFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, GENERAL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_ello)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .setVibrate(new long[] {0, 220, 160, 220});

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(getRawSoundUri("notificacao"));
        }

        NotificationManagerCompat.from(this).notify(notificationId, builder.build());
    }

    private void ensureGeneralChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationChannel existing = manager.getNotificationChannel(GENERAL_CHANNEL_ID);
        if (existing != null) return;

        NotificationChannel channel = new NotificationChannel(
            GENERAL_CHANNEL_ID,
            GENERAL_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(GENERAL_CHANNEL_DESCRIPTION);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] {0, 220, 160, 220});
        channel.setSound(
            getRawSoundUri("notificacao"),
            new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build()
        );

        manager.createNotificationChannel(channel);
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

    private int resolveGeneralNotificationId(@NonNull Map<String, String> data, @NonNull RemoteMessage remoteMessage) {
        final String seed = firstNonEmpty(
            data.get("notification_id"),
            data.get("message_id"),
            data.get("reference_id"),
            remoteMessage.getMessageId()
        );
        if (TextUtils.isEmpty(seed)) {
            return GENERAL_NOTIFICATION_BASE_ID + (int) (System.currentTimeMillis() % 10_000);
        }
        return GENERAL_NOTIFICATION_BASE_ID + Math.abs(seed.hashCode() % 10_000);
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
