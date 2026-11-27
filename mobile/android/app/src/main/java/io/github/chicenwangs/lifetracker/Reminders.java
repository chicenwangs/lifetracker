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
import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;

/**
 * Reminder alarms (#112). The server lists reminders due in the next 48 h; each gets an exact alarm that shows a
 * notification on time, app open or not. Notification actions (Done · Snooze 10 min · Tomorrow) work without
 * opening the app and queue offline edits for SyncWorker when there is no connection.
 */
public class Reminders extends BroadcastReceiver {
    static final String CHANNEL = "reminders";
    /** card 12: one fixed id for the daily agenda digest alarm (no Done / Snooze / Tomorrow) */
    static final String DIGEST = "digest";

    /** replace the alarm set with `list` (ones the server dropped are cancelled) + the digest alarm */
    static void schedule(Context c, JSONArray list, JSONObject digest) {
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
            PendingIntent pi = alarm(c, id, r.optString("title"), r.optString("route", "/"), r.optString("sourceType"), r.optString("sourceId"));
            setAlarm(am, due, pi);
            now.add(id);
            old.remove(id);
        }
        // the digest is re-added on every sync: the cancel loop below drops any id missing from `now`, so an
        // omitted digest would lose its alarm until the next sync that included it (card 12, D-V4-30)
        if (digest != null) {
            try {
                long due = Instant.parse(digest.optString("at")).toEpochMilli();
                if (due > t) {
                    setAlarm(am, due, alarm(c, DIGEST, digest.optString("text"), "/today", "", ""));
                    now.add(DIGEST);
                    old.remove(DIGEST);
                }
            } catch (Exception ignored) {
            }
        }
        for (String id : old) am.cancel(alarm(c, id, "", "/", "", ""));
        p.edit().putStringSet("alarms", now).apply();
    }

    private static void setAlarm(AlarmManager am, long due, PendingIntent pi) {
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, pi);
    }

    private static PendingIntent alarm(Context c, String id, String title, String route, String sourceType, String sourceId) {
        Intent i = new Intent(c, Reminders.class)
                .putExtra("id", id)
                .putExtra("title", title)
                .putExtra("route", route)
                .putExtra("sourceType", sourceType)
                .putExtra("sourceId", sourceId);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent action(Context c, String id, String title, String route, String sourceType, String sourceId, String act) {
        Intent i = new Intent(c, Reminders.class)
                .putExtra("id", id)
                .putExtra("title", title)
                .putExtra("route", route)
                .putExtra("sourceType", sourceType)
                .putExtra("sourceId", sourceId)
                .putExtra("act", act);
        return PendingIntent.getBroadcast(c, (id + ":" + act).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void channel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Reminders you set with /remind");
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    /** the alarm fired or a notification action button was tapped (#112) */
    @Override
    public void onReceive(Context c, Intent i) {
        String id = i.getStringExtra("id");
        if (id == null) return;
        String title = i.getStringExtra("title");
        String route = i.getStringExtra("route");
        String sourceType = i.getStringExtra("sourceType");
        String sourceId = i.getStringExtra("sourceId");
        String act = i.getStringExtra("act");
        if (DIGEST.equals(id)) {
            // card 12: the daily agenda, on the same reminders channel, with no actions
            if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
            channel(c);
            NotificationCompat.Builder d = new NotificationCompat.Builder(c, CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat_reminder)
                    .setColor(ContextCompat.getColor(c, R.color.lt_accent))
                    .setContentTitle(title)
                    .setContentText("Daily agenda")
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_REMINDER)
                    .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                    .setPublicVersion(new NotificationCompat.Builder(c, CHANNEL).setSmallIcon(R.drawable.ic_stat_reminder).setContentTitle("Daily agenda").build())
                    .setAutoCancel(true)
                    .setContentIntent(Native.open(c, route != null ? route : "/today", id.hashCode()));
            NotificationManagerCompat.from(c).notify(id.hashCode(), d.build());
            return;
        }
        if (act != null) {
            NotificationManagerCompat.from(c).cancel(id.hashCode());
            handleAction(c.getApplicationContext(), id, title, route, sourceType, sourceId, act);
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        channel(c);
        NotificationCompat.Builder n = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_reminder)
                .setColor(ContextCompat.getColor(c, R.color.lt_accent))
                .setContentTitle(title)
                .setContentText("Reminder")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                // a locked phone that hides private content shows just "Reminder", not the title
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(new NotificationCompat.Builder(c, CHANNEL).setSmallIcon(R.drawable.ic_stat_reminder).setContentTitle("Reminder").build())
                .setAutoCancel(true)
                .setContentIntent(Native.open(c, route != null ? route : "/", id.hashCode()))
                .addAction(0, "Done", action(c, id, title, route, sourceType, sourceId, "done"))
                .addAction(0, "Snooze 10 min", action(c, id, title, route, sourceType, sourceId, "snooze10"))
                .addAction(0, "Tomorrow", action(c, id, title, route, sourceType, sourceId, "tomorrow"));
        NotificationManagerCompat.from(c).notify(id.hashCode(), n.build());
    }

    private static void handleAction(Context c, String id, String title, String route, String sourceType, String sourceId, String act) {
        if ("done".equals(act) && sourceId != null && !sourceId.isEmpty()) {
            JSONObject j = Native.cached(c);
            for (String key : new String[] {"rows", "todos"}) {
                JSONArray a = j.optJSONArray(key);
                for (int k = 0; a != null && k < a.length(); k++) {
                    JSONObject r = a.optJSONObject(k);
                    if (r != null && sourceId.equals(r.optString("id"))) {
                        try {
                            r.put("status", "done");
                        } catch (Exception ignored) {
                        }
                    }
                }
            }
            Native.saveCache(c, j);
            Widgets.updateAll(c);
        } else if ("snooze10".equals(act) || "tomorrow".equals(act)) {
            long due;
            if ("snooze10".equals(act)) {
                due = System.currentTimeMillis() + 10 * 60_000L;
            } else {
                Calendar cal = Calendar.getInstance();
                cal.add(Calendar.DAY_OF_YEAR, 1);
                cal.set(Calendar.HOUR_OF_DAY, 9);
                cal.set(Calendar.MINUTE, 0);
                cal.set(Calendar.SECOND, 0);
                cal.set(Calendar.MILLISECOND, 0);
                due = cal.getTimeInMillis();
            }
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            setAlarm(am, due, alarm(c, id, title != null ? title : "Reminder", route != null ? route : "/", sourceType, sourceId));
        }
        enqueueAction(c, id, act);
        new Thread(() -> {
            flushQueue(c);
            SyncWorker.now(c);
        }).start();
    }

    private static synchronized void enqueueAction(Context c, String id, String act) {
        SharedPreferences p = c.getSharedPreferences(Native.PREFS, 0);
        try {
            JSONArray q = new JSONArray(p.getString("remQueue", "[]"));
            q.put(new JSONObject().put("id", id).put("action", act));
            p.edit().putString("remQueue", q.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** Send any queued notification Done/Snooze actions (#112); keeps unsent ones if still offline. */
    static synchronized void flushQueue(Context c) {
        SharedPreferences p = c.getSharedPreferences(Native.PREFS, 0);
        String raw = p.getString("remQueue", "[]");
        if ("[]".equals(raw)) return;
        try {
            JSONArray q = new JSONArray(raw);
            JSONArray left = new JSONArray();
            for (int i = 0; i < q.length(); i++) {
                JSONObject item = q.optJSONObject(i);
                if (item == null) continue;
                String id = item.optString("id");
                String action = item.optString("action");
                if (!id.matches("[a-z]+_[0-9a-z]+")) continue;
                boolean ok = Native.post(c, "/api/reminders/" + id, new JSONObject().put("action", action));
                if (!ok) left.put(item);
            }
            p.edit().putString("remQueue", left.toString()).apply();
        } catch (Exception ignored) {
        }
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
