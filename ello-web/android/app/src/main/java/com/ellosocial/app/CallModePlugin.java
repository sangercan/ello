package com.ellosocial.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CallMode")
public class CallModePlugin extends Plugin {

    private static final long WAKELOCK_TIMEOUT_MS = 2L * 60L * 60L * 1000L;
    private PowerManager.WakeLock wakeLock;

    @PluginMethod
    public void enable(PluginCall call) {
        bridge.executeOnMainThread(() -> {
            applyCallWindowFlags(true);
            acquireWakeLock();
            call.resolve();
        });
    }

    @PluginMethod
    public void disable(PluginCall call) {
        bridge.executeOnMainThread(() -> {
            applyCallWindowFlags(false);
            releaseWakeLock();
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        releaseWakeLock();
        super.handleOnDestroy();
    }

    private void applyCallWindowFlags(boolean enabled) {
        final Activity activity = getActivity();
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

    private void acquireWakeLock() {
        final Activity activity = getActivity();
        if (activity == null) return;

        final PowerManager powerManager =
            (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
        if (powerManager == null) return;

        if (wakeLock == null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Ello:CallModeWakeLock");
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

