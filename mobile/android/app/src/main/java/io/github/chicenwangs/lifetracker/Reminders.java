package io.github.chicenwangs.lifetracker;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

/**
 * Reminder alarms. The server lists reminders due in the next 48 h; each gets an exact alarm that shows a
 * notification on time, app open or not. Push needs Firebase; this needs nothing but the 15-min sync.
 */
public class Reminders extends BroadcastReceiver {
    static final String CHANNEL = "reminders";

    /** replace the alarm set with `list` (ones the server dropped are cancelled) */
    static void schedule(Context c, JSONArray list) {
        if (list == null) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences p = c.getSharedPreferences(Native.PREFS, 0);
        Set<String> old = new HashSet<>(p.getStringSet("alarms", new HashSet<>()));
        Set<String> now = new HashSet<>();
        long t = System.currentTimeMillis();
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r == null) continue;
            long due;
            try {
                due = Instant.parse(r.optString("dueAt")).toEpochMilli();
            } catch (Exception e) {
                continue;
            }
            if (due <= t) continue;
            String id = r.optString("id");
            PendingIntent pi = alarm(c, id, r.optString("title"), r.optString("route", "/"));
            boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, pi);
            now.add(id);
            old.remove(id);
        }
        for (String id : old) am.cancel(alarm(c, id, "", "/"));
        p.edit().putStringSet("alarms", now).apply();
    }

    private static PendingIntent alarm(Context c, String id, String title, String route) {
        Intent i = new Intent(c, Reminders.class).putExtra("id", id).putExtra("title", title).putExtra("route", route);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void channel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Reminders you set with /remind");
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    /** the alarm fired: show it */
    @Override
    public void onReceive(Context c, Intent i) {
        String id = i.getStringExtra("id");
        if (id == null) return;
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        channel(c);
        NotificationCompat.Builder n = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_reminder)
                .setColor(ContextCompat.getColor(c, R.color.lt_accent))
                .setContentTitle(i.getStringExtra("title"))
                .setContentText("Reminder")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(Native.open(c, i.getStringExtra("route"), id.hashCode()));
        NotificationManagerCompat.from(c).notify(id.hashCode(), n.build());
    }

    /** a reboot clears every alarm: sync again to set them back */
    public static class Boot extends BroadcastReceiver {
        @Override
        public void onReceive(Context c, Intent i) {
            if (Intent.ACTION_BOOT_COMPLETED.equals(i.getAction()) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(i.getAction())) {
                c.getSharedPreferences(Native.PREFS, 0).edit().remove("alarms").apply();
                SyncWorker.now(c);
            }
        }
    }
}
