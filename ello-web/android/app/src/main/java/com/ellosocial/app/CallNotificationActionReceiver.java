package com.ellosocial.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationManagerCompat;

public class CallNotificationActionReceiver extends BroadcastReceiver {
    private static final int CALL_NOTIFICATION_BASE_ID = 700000;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;

        String action = normalizeAction(intent.getStringExtra(CallNotificationsPlugin.EXTRA_CALL_ACTION));
        if (TextUtils.isEmpty(action)) return;

        dismissNotification(context, intent);

        CallNotificationsPlugin.enqueueActionFromIntent(intent, action);

        if (CallNotificationsPlugin.ACTION_DECLINE.equals(action)) {
            return;
        }

        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_SINGLE_TOP |
            Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        if (intent.getExtras() != null) {
            launchIntent.putExtras(intent.getExtras());
        }
        launchIntent.putExtra(CallNotificationsPlugin.EXTRA_CALL_ACTION, action);
        launchIntent.putExtra(CallNotificationsPlugin.EXTRA_FROM_CALL_NOTIFICATION, true);
        context.startActivity(launchIntent);
    }

    @NonNull
    private String normalizeAction(String rawAction) {
        if (rawAction == null) return "";
        String action = rawAction.trim().toLowerCase();
        if (CallNotificationsPlugin.ACTION_ANSWER.equals(action) || CallNotificationsPlugin.ACTION_DECLINE.equals(action)) {
            return action;
        }
        return "";
    }

    private void dismissNotification(Context context, Intent intent) {
        int notificationId = resolveNotificationId(intent);
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        manager.cancel(notificationId);
        manager.cancel(CALL_NOTIFICATION_BASE_ID);
    }

    private int resolveNotificationId(Intent intent) {
        Object rawValue = intent.getExtras() != null
            ? intent.getExtras().get(CallNotificationsPlugin.EXTRA_CALL_NOTIFICATION_ID)
            : null;

        if (rawValue instanceof Number) {
            int value = ((Number) rawValue).intValue();
            if (value > 0) return value;
        }

        if (rawValue instanceof String) {
            try {
                int value = Integer.parseInt((String) rawValue);
                if (value > 0) return value;
            } catch (NumberFormatException ignored) {
                // Fallback below.
            }
        }

        return CALL_NOTIFICATION_BASE_ID;
    }
}
