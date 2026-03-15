package com.ellosocial.app;

import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.text.TextUtils;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationManagerCompat;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class IncomingCallActivity extends AppCompatActivity {
    private static final int CALL_NOTIFICATION_BASE_ID = 700000;
    private static final String DEFAULT_TITLE = "Chamada recebida";
    private static final String DEFAULT_SUBTITLE = "Toque para atender";

    private Bundle callExtras = new Bundle();
    private final ExecutorService avatarExecutor = Executors.newSingleThreadExecutor();
    private volatile String requestedAvatarUrl = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        CallModePlugin.applyCallWindowFlags(this, true);
        setContentView(R.layout.activity_incoming_call);

        callExtras = getIntent() != null && getIntent().getExtras() != null
            ? new Bundle(getIntent().getExtras())
            : new Bundle();

        bindUi();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        callExtras = intent != null && intent.getExtras() != null
            ? new Bundle(intent.getExtras())
            : new Bundle();
        bindUi();
    }

    @Override
    protected void onDestroy() {
        avatarExecutor.shutdownNow();
        CallModePlugin.applyCallWindowFlags(this, false);
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        dispatchAction(CallNotificationsPlugin.ACTION_DECLINE);
    }

    private void bindUi() {
        TextView titleView = findViewById(R.id.incomingCallTitle);
        TextView subtitleView = findViewById(R.id.incomingCallSubtitle);
        ImageView avatarView = findViewById(R.id.incomingCallAvatar);

        String title = firstNonEmpty(
            valueFromExtras("title"),
            valueFromExtras("caller_name"),
            valueFromExtras("caller"),
            DEFAULT_TITLE
        );
        String subtitle = firstNonEmpty(
            valueFromExtras("body"),
            valueFromExtras("subtitle"),
            callTypeSubtitle(valueFromExtras("call_type")),
            DEFAULT_SUBTITLE
        );

        titleView.setText(title);
        subtitleView.setText(subtitle);
        bindCallerAvatar(avatarView);

        findViewById(R.id.answerCallButton).setOnClickListener(v -> dispatchAction(CallNotificationsPlugin.ACTION_ANSWER));
        findViewById(R.id.declineCallButton).setOnClickListener(v -> dispatchAction(CallNotificationsPlugin.ACTION_DECLINE));
    }

    private void bindCallerAvatar(@NonNull ImageView avatarView) {
        final String avatarUrl = firstNonEmpty(
            valueFromExtras("caller_avatar_url"),
            valueFromExtras("caller_avatar"),
            valueFromExtras("avatar_url"),
            valueFromExtras("avatar"),
            valueFromExtras("from_user_avatar_url")
        );

        avatarView.setImageResource(R.drawable.ic_stat_ello);
        if (TextUtils.isEmpty(avatarUrl)) {
            requestedAvatarUrl = "";
            return;
        }

        final String requestUrl = avatarUrl.trim();
        requestedAvatarUrl = requestUrl;

        avatarExecutor.execute(() -> {
            Bitmap bitmap = AvatarBitmapFetcher.load(requestUrl, 256);
            runOnUiThread(() -> {
                if (!TextUtils.equals(requestedAvatarUrl, requestUrl)) return;
                if (bitmap != null) {
                    avatarView.setImageBitmap(bitmap);
                } else {
                    avatarView.setImageResource(R.drawable.ic_stat_ello);
                }
            });
        });
    }

    private void dispatchAction(@NonNull String action) {
        dismissNotification();

        Intent intent = new Intent(this, CallNotificationActionReceiver.class);
        if (callExtras != null && !callExtras.isEmpty()) {
            intent.putExtras(callExtras);
        }
        intent.putExtra(CallNotificationsPlugin.EXTRA_CALL_ACTION, action);
        intent.putExtra(CallNotificationsPlugin.EXTRA_CALL_NOTIFICATION_ID, resolveNotificationId());
        intent.putExtra(CallNotificationsPlugin.EXTRA_FROM_CALL_NOTIFICATION, true);
        intent.setAction("com.ellosocial.app.incoming_call_action." + action + "." + System.currentTimeMillis());
        sendBroadcast(intent);

        finishAndRemoveTask();
    }

    private void dismissNotification() {
        NotificationManagerCompat manager = NotificationManagerCompat.from(this);
        manager.cancel(resolveNotificationId());
        manager.cancel(CALL_NOTIFICATION_BASE_ID);
    }

    private int resolveNotificationId() {
        String callIdRaw = valueFromExtras("call_id");
        if (TextUtils.isEmpty(callIdRaw)) return CALL_NOTIFICATION_BASE_ID;
        try {
            int callId = Integer.parseInt(callIdRaw);
            if (callId < 0) return CALL_NOTIFICATION_BASE_ID;
            return CALL_NOTIFICATION_BASE_ID + callId;
        } catch (NumberFormatException ignored) {
            return CALL_NOTIFICATION_BASE_ID;
        }
    }

    @NonNull
    private String valueFromExtras(@NonNull String key) {
        if (callExtras == null) return "";
        Object value = callExtras.get(key);
        if (value == null) return "";
        return String.valueOf(value);
    }

    @NonNull
    private String callTypeSubtitle(@NonNull String callTypeRaw) {
        String callType = callTypeRaw.trim().toLowerCase();
        if ("video".equals(callType)) {
            return "Chamada de video";
        }
        if ("voice".equals(callType)) {
            return "Chamada de voz";
        }
        return "";
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
