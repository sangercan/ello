package com.ellosocial.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallModePlugin.class);
        registerPlugin(CallPiPPlugin.class);
        registerPlugin(CallNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        handleCallNotificationIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleCallNotificationIntent(intent);
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        CallPiPPlugin.maybeEnterOnUserLeave(this);
    }

    private void handleCallNotificationIntent(Intent intent) {
        CallNotificationsPlugin.enqueueActionFromIntent(intent);
    }
}
