package io.github.chicenwangs.lifetracker;

import android.os.Build;
import android.view.HapticFeedbackConstants;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * window.Capacitor.Plugins.Haptics.feel({ kind }) for app/src/lib/client/haptics.ts (#102).
 * performHapticFeedback follows the phone's own haptics setting, so "off" stays off.
 */
@CapacitorPlugin(name = "Haptics")
public class HapticsPlugin extends Plugin {
    @PluginMethod
    public void feel(PluginCall call) {
        String kind = call.getString("kind", "tick");
        int c;
        switch (kind) {
            case "pickup": c = HapticFeedbackConstants.LONG_PRESS; break;
            case "success": c = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY; break;
            case "warning": c = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS; break;
            default: c = HapticFeedbackConstants.CLOCK_TICK;
        }
        final int fc = c;
        getActivity().runOnUiThread(() -> getBridge().getWebView().performHapticFeedback(fc));
        call.resolve();
    }
}
