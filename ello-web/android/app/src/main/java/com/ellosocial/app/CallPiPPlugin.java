package com.ellosocial.app;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Rational;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CallPiP")
public class CallPiPPlugin extends Plugin {
    private static volatile boolean autoEnterOnUserLeave = false;

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", canUsePictureInPicture(getActivity()));
        call.resolve(result);
    }

    @PluginMethod
    public void enter(PluginCall call) {
        bridge.executeOnMainThread(() -> {
            JSObject result = new JSObject();
            Activity activity = getActivity();
            boolean supported = canUsePictureInPicture(activity);
            result.put("supported", supported);
            if (!supported) {
                result.put("entered", false);
                call.resolve(result);
                return;
            }

            try {
                int width = call.getInt("width", 16);
                int height = call.getInt("height", 9);
                boolean autoEnter = call.getBoolean("autoEnter", true);
                PictureInPictureParams params = buildParams(width, height, autoEnter);
                boolean entered = activity != null && activity.enterPictureInPictureMode(params);
                result.put("entered", entered);
                call.resolve(result);
            } catch (Exception exception) {
                call.reject("Failed to enter Picture-in-Picture mode.", exception);
            }
        });
    }

    @PluginMethod
    public void setAutoEnterOnUserLeave(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        autoEnterOnUserLeave = enabled;
        JSObject result = new JSObject();
        result.put("enabled", autoEnterOnUserLeave);
        call.resolve(result);
    }

    public static void maybeEnterOnUserLeave(Activity activity) {
        if (!autoEnterOnUserLeave) return;
        if (!canUsePictureInPicture(activity)) return;
        try {
            PictureInPictureParams params = buildParams(16, 9, true);
            activity.enterPictureInPictureMode(params);
        } catch (Exception ignored) {
            // Best effort only.
        }
    }

    private static boolean canUsePictureInPicture(Activity activity) {
        if (activity == null) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        PackageManager packageManager = activity.getPackageManager();
        if (packageManager == null) return false;
        return packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    private static PictureInPictureParams buildParams(int width, int height, boolean autoEnter) {
        PictureInPictureParams.Builder paramsBuilder = new PictureInPictureParams.Builder();
        if (width > 0 && height > 0) {
            paramsBuilder.setAspectRatio(new Rational(width, height));
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            paramsBuilder.setAutoEnterEnabled(autoEnter);
        }
        return paramsBuilder.build();
    }
}
