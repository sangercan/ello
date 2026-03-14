package com.ellosocial.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallModePlugin.class);
        registerPlugin(CallPiPPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
