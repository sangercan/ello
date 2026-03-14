package com.ellosocial.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "CallNotifications")
public class CallNotificationsPlugin extends Plugin {
    private static final String TAG = "CallNotifications";
    private static final String EVENT_NAME = "callAction";

    public static final String EXTRA_CALL_ACTION = "ello_call_action";
    public static final String EXTRA_CALL_NOTIFICATION_ID = "ello_call_notification_id";
    public static final String EXTRA_FROM_CALL_NOTIFICATION = "ello_from_call_notification";

    public static final String ACTION_OPEN = "open";
    public static final String ACTION_ANSWER = "answer";
    public static final String ACTION_DECLINE = "decline";

    private static final Object LOCK = new Object();
    private static final List<String> PENDING_ACTIONS = new ArrayList<>();
    @Nullable
    private static CallNotificationsPlugin activeInstance = null;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
        emitPendingActions();
    }

    @Override
    protected void handleOnDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void drainPendingActions(PluginCall call) {
        JSArray actions = new JSArray();
        synchronized (LOCK) {
            for (String serializedPayload : PENDING_ACTIONS) {
                try {
                    actions.put(new JSObject(serializedPayload));
                } catch (JSONException exception) {
                    Log.w(TAG, "Could not parse pending call action payload", exception);
                }
            }
            PENDING_ACTIONS.clear();
        }

        JSObject result = new JSObject();
        result.put("actions", actions);
        call.resolve(result);
    }

    public static void enqueueActionFromIntent(@Nullable Intent intent) {
        enqueueActionFromIntent(intent, null);
    }

    public static void enqueueActionFromIntent(@Nullable Intent intent, @Nullable String fallbackAction) {
        if (intent == null) return;

        JSObject data = extractIntentData(intent);
        String action = normalizeAction(intent.getStringExtra(EXTRA_CALL_ACTION));
        if (TextUtils.isEmpty(action)) {
            action = normalizeAction(fallbackAction);
        }
        if (TextUtils.isEmpty(action)) {
            String type = String.valueOf(data.opt("type")).trim().toLowerCase();
            if ("incoming_call".equals(type)) {
                action = ACTION_OPEN;
            }
        }
        if (TextUtils.isEmpty(action)) return;

        long now = System.currentTimeMillis();
        String messageId = String.valueOf(data.opt("google.message_id"));
        String callId = String.valueOf(data.opt("call_id"));
        boolean hasMessageId = !TextUtils.isEmpty(messageId) && !"null".equalsIgnoreCase(messageId);
        String eventId = hasMessageId ? action + ":" + messageId : action + ":" + callId + ":" + now;

        JSObject payload = new JSObject();
        payload.put("event_id", eventId);
        payload.put("action", action);
        payload.put("received_at", now);
        payload.put("data", data);

        enqueueSerializedPayload(payload.toString());
    }

    @NonNull
    private static JSObject extractIntentData(@NonNull Intent intent) {
        JSObject data = new JSObject();
        Bundle extras = intent.getExtras();
        if (extras == null) return data;

        for (String key : extras.keySet()) {
            Object value = extras.get(key);
            if (value == null) continue;
            if (value instanceof Boolean || value instanceof Number || value instanceof String) {
                data.put(key, value);
            } else {
                data.put(key, String.valueOf(value));
            }
        }
        return data;
    }

    @NonNull
    private static String normalizeAction(@Nullable String rawAction) {
        if (rawAction == null) return "";
        String action = rawAction.trim().toLowerCase();
        if (ACTION_OPEN.equals(action) || ACTION_ANSWER.equals(action) || ACTION_DECLINE.equals(action)) {
            return action;
        }
        return "";
    }

    private static void enqueueSerializedPayload(@NonNull String serializedPayload) {
        synchronized (LOCK) {
            PENDING_ACTIONS.add(serializedPayload);
            if (PENDING_ACTIONS.size() > 120) {
                PENDING_ACTIONS.remove(0);
            }
        }
        emitToListeners(serializedPayload);
    }

    private static void emitPendingActions() {
        List<String> snapshot = new ArrayList<>();
        synchronized (LOCK) {
            snapshot.addAll(PENDING_ACTIONS);
        }
        for (String serializedPayload : snapshot) {
            emitToListeners(serializedPayload);
        }
    }

    private static void emitToListeners(@NonNull String serializedPayload) {
        CallNotificationsPlugin plugin = activeInstance;
        if (plugin == null) return;

        Runnable emitTask = () -> {
            try {
                plugin.notifyListeners(EVENT_NAME, new JSObject(serializedPayload), true);
            } catch (JSONException exception) {
                Log.w(TAG, "Could not emit call action payload", exception);
            }
        };

        Activity activity = plugin.getActivity();
        if (activity != null) {
            activity.runOnUiThread(emitTask);
        } else {
            emitTask.run();
        }
    }
}
