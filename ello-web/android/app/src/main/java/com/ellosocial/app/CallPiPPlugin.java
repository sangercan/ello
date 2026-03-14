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

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", canUsePictureInPicture());
        call.resolve(result);
    }

    @PluginMethod
    public void enter(PluginCall call) {
        bridge.executeOnMainThread(() -> {
            JSObject result = new JSObject();
            boolean supported = canUsePictureInPicture();
            result.put("supported", supported);
            if (!supported) {
                result.put("entered", false);
                call.resolve(result);
                return;
            }

            try {
                PictureInPictureParams.Builder paramsBuilder = new PictureInPictureParams.Builder();
                int width = call.getInt("width", 16);
                int height = call.getInt("height", 9);
                if (width > 0 && height > 0) {
                    paramsBuilder.setAspectRatio(new Rational(width, height));
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    paramsBuilder.setAutoEnterEnabled(call.getBoolean("autoEnter", true));
                }

                Activity activity = getActivity();
                boolean entered = activity != null && activity.enterPictureInPictureMode(paramsBuilder.build());
                result.put("entered", entered);
                call.resolve(result);
            } catch (Exception exception) {
                call.reject("Failed to enter Picture-in-Picture mode.", exception);
            }
        });
    }

    private boolean canUsePictureInPicture() {
        Activity activity = getActivity();
        if (activity == null) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        PackageManager packageManager = activity.getPackageManager();
        if (packageManager == null) return false;
        return packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }
}
