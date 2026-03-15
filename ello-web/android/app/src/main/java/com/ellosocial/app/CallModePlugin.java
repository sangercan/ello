package com.ellosocial.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.text.TextUtils;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CallMode")
public class CallModePlugin extends Plugin {

    private static final long WAKELOCK_TIMEOUT_MS = 2L * 60L * 60L * 1000L;
    private static final String DEFAULT_CALL_TITLE = "Chamada em andamento";
    private static final String DEFAULT_CALL_SUBTITLE = "Ello Social";
    private PowerManager.WakeLock wakeLock;

    @PluginMethod
    public void enable(PluginCall call) {
        bridge.executeOnMainThread(() -> {
            applyCallWindowFlags(getActivity(), true);
            acquireWakeLock();
            startOrUpdateForegroundService(call, CallForegroundService.ACTION_START);
            call.resolve();
        });
    }

    @PluginMethod
    public void disable(PluginCall call) {
        bridge.executeOnMainThread(() -> {
            applyCallWindowFlags(getActivity(), false);
            releaseWakeLock();
            stopForegroundService();
            call.resolve();
        });
    }

    @PluginMethod
    public void update(PluginCall call) {
        bridge.executeOnMainThread(() -> {
            startOrUpdateForegroundService(call, CallForegroundService.ACTION_UPDATE);
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        releaseWakeLock();
        super.handleOnDestroy();
    }

    public static void applyCallWindowFlags(Activity activity, boolean enabled) {
        if (activity == null) return;

        final Window window = activity.getWindow();
        if (window == null) return;

        if (enabled) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                activity.setShowWhenLocked(true);
                activity.setTurnScreenOn(true);
            }

            window.addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                KeyguardManager keyguardManager =
                    (KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE);
                if (keyguardManager != null) {
                    keyguardManager.requestDismissKeyguard(activity, null);
                }
            }
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                activity.setShowWhenLocked(false);
                activity.setTurnScreenOn(false);
            }

            window.clearFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }
    }

    private void startOrUpdateForegroundService(PluginCall call, String action) {
        final Context context = getContext();
        if (context == null) return;

        final String titleRaw = call.getString("title", DEFAULT_CALL_TITLE);
        final String subtitleRaw = call.getString("subtitle", DEFAULT_CALL_SUBTITLE);
        final String title = TextUtils.isEmpty(titleRaw) ? DEFAULT_CALL_TITLE : titleRaw;
        final String subtitle = TextUtils.isEmpty(subtitleRaw) ? DEFAULT_CALL_SUBTITLE : subtitleRaw;
        final int callId = call.getInt("callId", -1);
        final boolean isVideo = call.getBoolean("isVideo", false);

        Intent serviceIntent = new Intent(context, CallForegroundService.class);
        serviceIntent.setAction(action);
        serviceIntent.putExtra(CallForegroundService.EXTRA_CALL_ID, callId);
        serviceIntent.putExtra(CallForegroundService.EXTRA_TITLE, title);
        serviceIntent.putExtra(CallForegroundService.EXTRA_SUBTITLE, subtitle);
        serviceIntent.putExtra(CallForegroundService.EXTRA_IS_VIDEO, isVideo);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }

    private void stopForegroundService() {
        final Context context = getContext();
        if (context == null) return;
        boolean stopped = context.stopService(new Intent(context, CallForegroundService.class));
        if (!stopped) {
            Intent stopIntent = new Intent(context, CallForegroundService.class);
            stopIntent.setAction(CallForegroundService.ACTION_STOP);
            try {
                context.startService(stopIntent);
            } catch (Exception ignored) {
                // Service may already be stopped.
            }
        }
    }

    private void acquireWakeLock() {
        final Activity activity = getActivity();
        if (activity == null) return;

        final PowerManager powerManager =
            (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
        if (powerManager == null) return;

        if (wakeLock == null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ElloSocial:CallModeWakeLock");
            wakeLock.setReferenceCounted(false);
        }

        if (!wakeLock.isHeld()) {
            wakeLock.acquire(WAKELOCK_TIMEOUT_MS);
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }
}
