package io.github.chicenwangs.lifetracker;

import android.content.Context;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/** #201: sign-out on a shared phone leaves nothing private behind (alarms, cached sync, queued taps, widgets). */
@CapacitorPlugin(name = "Session")
public class SessionPlugin extends Plugin {
    static void wipe(Context c) {
        Reminders.schedule(c, new JSONArray()); // cancels every alarm set
        Reminders.scheduleDigest(c, null); // PR 12: the daily agenda alarm too
        NotificationManagerCompat.from(c).cancelAll();
        c.getSharedPreferences(Native.PREFS, 0).edit().remove("sync").remove("remQueue").putBoolean("signedOut", true).apply();
        Widgets.updateAll(c);
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        wipe(getContext());
        call.resolve();
    }
}
