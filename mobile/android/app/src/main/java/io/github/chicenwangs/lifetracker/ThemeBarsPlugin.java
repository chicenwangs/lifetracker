package io.github.chicenwangs.lifetracker;

import android.app.Activity;
import android.content.res.Configuration;
import android.os.Build;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * #114: status + navigation bar colours and icon brightness follow Life Tracker's own theme
 * (light = dark icons on #e8d9e6; dark = light icons on #0e0d2a), alongside Capacitor's SystemBars.
 */
@CapacitorPlugin(name = "ThemeBars")
public class ThemeBarsPlugin extends Plugin {
    static final int BG_DARK = 0xFF0E0D2A;
    static final int BG_LIGHT = 0xFFE8D9E6;
    private static boolean lastDark = true;

    @SuppressWarnings("deprecation")
    static void apply(Activity a, boolean dark) {
        lastDark = dark;
        if (a == null) return;
        Window w = a.getWindow();
        int bg = dark ? BG_DARK : BG_LIGHT;
        w.getDecorView().setBackgroundColor(bg);
        if (Build.VERSION.SDK_INT < 35) {
            w.setStatusBarColor(bg);
            w.setNavigationBarColor(bg);
        }
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
        c.setAppearanceLightStatusBars(!dark);
        c.setAppearanceLightNavigationBars(!dark);
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        apply(getActivity(), lastDark);
    }

    @PluginMethod
    public void setDark(PluginCall call) {
        boolean dark = call.getBoolean("dark", true);
        getActivity().runOnUiThread(() -> apply(getActivity(), dark));
        call.resolve();
    }
}
