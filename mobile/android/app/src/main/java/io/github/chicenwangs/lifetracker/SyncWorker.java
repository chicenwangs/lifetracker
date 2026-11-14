package io.github.chicenwangs.lifetracker;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

/** Every 15 min (and when the app goes to the background): fetch /api/native, redraw widgets, set reminder alarms. */
public class SyncWorker extends Worker {
    public SyncWorker(@NonNull Context c, @NonNull WorkerParameters p) {
        super(c, p);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        JSONObject j = Native.get(c, Native.base(c) + "/api/native", true);
        if (j == null) {
            // offline or signed out: widgets keep the last copy, alarms already set stay set
            c.getSharedPreferences(Native.PREFS, 0).edit().putBoolean("signedOut", Native.get(c, Native.base(c) + "/healthz", false) != null).apply();
        } else {
            c.getSharedPreferences(Native.PREFS, 0).edit().putString("sync", j.toString()).putBoolean("signedOut", false).apply();
            Reminders.schedule(c, j.optJSONArray("reminders"));
        }
        Widgets.updateAll(c);
        return Result.success();
    }

    private static Constraints online() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    /** the 15-min heartbeat (Android's shortest period) */
    static void schedule(Context c) {
        PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(SyncWorker.class, 15, TimeUnit.MINUTES).setConstraints(online()).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("sync", ExistingPeriodicWorkPolicy.KEEP, r);
    }

    /** one extra run soon, e.g. after edits in the app */
    static void now(Context c) {
        OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(SyncWorker.class).setConstraints(online()).build();
        WorkManager.getInstance(c).enqueueUniqueWork("sync-now", ExistingWorkPolicy.REPLACE, r);
    }
}
