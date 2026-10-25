package com.aionforge.app;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells the web app how hot the phone is (src/native/thermal.ts), so the black
 * hole close-up can trace less finely before the phone runs hot
 * (Documents/Black-Hole-Phone-Quality.md, BH3). Read-only; it changes nothing.
 *
 * - status: Android's thermal status, 0 none … 6 shutdown, or -1 before Android 10.
 * - headroom: how near the phone is to slowing itself down, forecast 10 s ahead
 *   (1.0 = it would throttle); absent before Android 11 or when Android has no value.
 * - batteryTempC: the battery's temperature, °C.
 */
@CapacitorPlugin(name = "Thermal")
public class ThermalPlugin extends Plugin {

    private static final int HEADROOM_FORECAST_SECONDS = 10;

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);

        result.put("status", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? power.getCurrentThermalStatus() : -1);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            float headroom = power.getThermalHeadroom(HEADROOM_FORECAST_SECONDS);
            if (!Float.isNaN(headroom)) result.put("headroom", headroom);
        }

        // The battery's last broadcast state; reading it needs no permission
        Intent battery = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery != null) {
            int tenthsOfDegree = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
            if (tenthsOfDegree != Integer.MIN_VALUE) result.put("batteryTempC", tenthsOfDegree / 10.0);
        }
        call.resolve(result);
    }
}
