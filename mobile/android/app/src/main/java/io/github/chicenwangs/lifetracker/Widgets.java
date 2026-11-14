package io.github.chicenwangs.lifetracker;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/** Home screen widgets: Today timeline + Keep notes. They draw the cached /api/native answer; SyncWorker refreshes it. */
final class Widgets {
    private Widgets() {}

    static final int MAX_ROWS = 6;

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, Timeline.class))) m.updateAppWidget(id, timeline(c));
        for (int id : m.getAppWidgetIds(new ComponentName(c, Keep.class))) m.updateAppWidget(id, keep(c));
    }

    /** "" when fine, else what the widget should say instead of rows */
    private static String status(Context c, JSONObject j) {
        if (c.getSharedPreferences(Native.PREFS, 0).getBoolean("signedOut", false)) return "Open Life Tracker and sign in.";
        if (!j.has("day")) return "Open Life Tracker once to load.";
        return "";
    }

    static RemoteViews timeline(Context c) {
        JSONObject j = Native.cached(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_timeline);
        v.setTextViewText(R.id.title, j.optString("label", "Today"));
        v.setOnClickPendingIntent(R.id.title, Native.open(c, "/today", 1));
        v.setOnClickPendingIntent(R.id.add, Native.open(c, "/today?add", 2));
        v.removeAllViews(R.id.rows);
        String msg = status(c, j);
        Calendar now = Calendar.getInstance();
        int nowMin = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        // the cached day may be yesterday's (phone slept): then show nothing rather than old rows
        String today = String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1, now.get(Calendar.DAY_OF_MONTH));
        JSONArray rows = today.equals(j.optString("day")) ? j.optJSONArray("rows") : null;
        int shown = 0;
        for (int i = 0; rows != null && i < rows.length() && shown < MAX_ROWS; i++) {
            JSONObject r = rows.optJSONObject(i);
            if (r == null || r.optInt("end") <= nowMin) continue; // from now on
            RemoteViews row = new RemoteViews(c.getPackageName(), R.layout.widget_row);
            row.setTextViewText(R.id.time, r.optString("time"));
            row.setTextViewText(R.id.text, (r.optBoolean("done") ? "✓ " : "") + r.optString("title"));
            row.setInt(R.id.bar, "setBackgroundColor", color(r.optString("color"), c));
            if (r.optInt("start") <= nowMin) row.setTextColor(R.id.time, c.getColor(R.color.lt_accent)); // happening now
            row.setOnClickPendingIntent(R.id.row, Native.open(c, "/today", 3));
            v.addView(R.id.rows, row);
            shown++;
        }
        if (msg.isEmpty() && shown == 0) msg = j.optJSONArray("rows") != null && j.optJSONArray("rows").length() > 0 && today.equals(j.optString("day")) ? "Done for today." : "Nothing planned.";
        v.setTextViewText(R.id.empty, msg);
        v.setViewVisibility(R.id.empty, shown == 0 ? View.VISIBLE : View.GONE);
        return v;
    }

    static RemoteViews keep(Context c) {
        JSONObject j = Native.cached(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_keep);
        v.setOnClickPendingIntent(R.id.title, Native.open(c, "/keep", 10));
        v.setOnClickPendingIntent(R.id.add, Native.open(c, "/keep?new", 11));
        v.removeAllViews(R.id.rows);
        JSONArray notes = j.optJSONArray("notes");
        int n = notes == null ? 0 : Math.min(notes.length(), MAX_ROWS);
        for (int i = 0; i < n; i++) {
            JSONObject note = notes.optJSONObject(i);
            if (note == null) continue;
            String title = note.optString("title");
            String text = note.optString("text");
            RemoteViews row = new RemoteViews(c.getPackageName(), R.layout.widget_note);
            row.setTextViewText(R.id.text, (note.optBoolean("pinned") ? "📌 " : "") + (title.isEmpty() ? text : title));
            row.setTextViewText(R.id.sub, title.isEmpty() ? "" : text);
            row.setViewVisibility(R.id.sub, title.isEmpty() || text.isEmpty() ? View.GONE : View.VISIBLE);
            row.setOnClickPendingIntent(R.id.row, Native.open(c, "/keep?note=" + note.optString("id"), 100 + i));
            v.addView(R.id.rows, row);
        }
        String msg = status(c, j);
        if (msg.isEmpty() && n == 0) msg = "No notes yet. Tap + to add one.";
        v.setTextViewText(R.id.empty, msg);
        v.setViewVisibility(R.id.empty, n == 0 ? View.VISIBLE : View.GONE);
        return v;
    }

    private static int color(String hex, Context c) {
        try {
            return Color.parseColor(hex);
        } catch (Exception e) {
            return c.getColor(R.color.lt_edge);
        }
    }

    /** Android asks for a redraw (added, resized, every 30 min): draw the cache, then fetch fresh data */
    public static class Timeline extends AppWidgetProvider {
        @Override
        public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
            for (int id : ids) m.updateAppWidget(id, timeline(c));
            SyncWorker.now(c);
        }
    }

    public static class Keep extends AppWidgetProvider {
        @Override
        public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
            for (int id : ids) m.updateAppWidget(id, keep(c));
            SyncWorker.now(c);
        }
    }
}
