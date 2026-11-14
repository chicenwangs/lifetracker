package io.github.chicenwangs.lifetracker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.Toast;

import androidx.core.widget.RemoteViewsCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/**
 * Seven home screen widgets, all drawn from the cached /api/native answer (SyncWorker refreshes it). They copy the
 * app's look: card with border + yellow hard shadow, type-coloured boxes, tick squares, the now band, and follow the
 * account's Light / Dark / Auto theme. Big lists scroll; the + sits bottom-right under the thumb.
 */
final class Widgets {
    private Widgets() {}

    private static final Class<?>[] ALL = {Timeline.class, Keep.class, NowNext.class, Quick.class, Todo.class, Countdown.class, Week.class};

    static void updateAll(Context c) {
        JSONObject j = Native.cached(c);
        Theme t = Theme.of(c, j);
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (Class<?> k : ALL)
            for (int id : m.getAppWidgetIds(new ComponentName(c, k))) {
                try {
                    m.updateAppWidget(id, render(c, k, id, j, t));
                } catch (Exception e) {
                    // one broken widget must not stop the others
                }
            }
    }

    private static RemoteViews render(Context c, Class<?> k, int id, JSONObject j, Theme t) {
        if (k == Timeline.class) return timeline(c, id, j, t);
        if (k == Keep.class) return keep(c, id, j, t);
        if (k == NowNext.class) return nowNext(c, j, t);
        if (k == Quick.class) return quick(c, t);
        if (k == Todo.class) return todo(c, id, j, t);
        if (k == Countdown.class) return countdown(c, id, j, t);
        return week(c, id, j, t);
    }

    // ---------- shared bits ----------

    /** "" = fine, else what to say instead of content */
    private static String status(Context c, JSONObject j) {
        if (c.getSharedPreferences(Native.PREFS, 0).getBoolean("signedOut", false)) return "Open Life Tracker and sign in.";
        if (!j.has("day")) return "Open Life Tracker once to load.";
        return "";
    }

    /** the cached day can be yesterday's (phone slept): then today's lists are empty, not stale */
    private static boolean isToday(JSONObject j) {
        Calendar n = Calendar.getInstance();
        String today = String.format(Locale.ROOT, "%04d-%02d-%02d", n.get(Calendar.YEAR), n.get(Calendar.MONTH) + 1, n.get(Calendar.DAY_OF_MONTH));
        return today.equals(j.optString("day"));
    }

    // shortcut: "now" = the phone's clock; the server's day uses the account timezone. Same zone = fine.
    private static int nowMin() {
        Calendar n = Calendar.getInstance();
        return n.get(Calendar.HOUR_OF_DAY) * 60 + n.get(Calendar.MINUTE);
    }

    private static int col(String hex, int fallback) {
        try {
            return hex == null || hex.isEmpty() || hex.equals("null") ? fallback : Color.parseColor(hex);
        } catch (Exception e) {
            return fallback;
        }
    }

    private static String dur(int min) {
        return min < 60 ? min + " min" : min % 60 == 0 ? (min / 60) + " h" : (min / 60) + " h " + (min % 60) + " min";
    }

    /** header · list · empty · + (shared frame of the list widgets) */
    private static RemoteViews frame(Context c, Theme t, String title, String sub, String badge, String headPath, String fabPath, String empty, int req) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_list);
        v.setImageViewResource(R.id.bg, t.cardRes());
        v.setTextViewText(R.id.title, title);
        v.setTextColor(R.id.title, t.ink);
        v.setTextViewText(R.id.sub, sub);
        v.setTextColor(R.id.sub, t.quiet);
        v.setViewVisibility(R.id.sub, sub.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.badge, badge);
        v.setViewVisibility(R.id.badge, badge.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.empty, empty);
        v.setTextColor(R.id.empty, t.quiet);
        v.setEmptyView(R.id.list, R.id.empty);
        v.setOnClickPendingIntent(R.id.head, Native.open(c, headPath, req));
        if (fabPath == null) v.setViewVisibility(R.id.fab, View.GONE);
        else v.setOnClickPendingIntent(R.id.fab, Native.open(c, fabPath, req + 1));
        v.setPendingIntentTemplate(R.id.list, WidgetAction.template(c, req + 2));
        return v;
    }

    /** tick square like the app: outline when open, ink fill + tick in the box colour when done */
    private static void check(RemoteViews v, boolean done, int ink, int on) {
        v.setImageViewResource(R.id.chkBox, done ? R.drawable.ic_box_fill : R.drawable.ic_box);
        v.setInt(R.id.chkBox, "setColorFilter", ink);
        v.setViewVisibility(R.id.chkTick, done ? View.VISIBLE : View.GONE);
        v.setInt(R.id.chkTick, "setColorFilter", on);
        v.setContentDescription(R.id.chk, done ? "Done. Tap to undo" : "Tap to mark done");
    }

    private static void strike(RemoteViews v, int id, boolean on) {
        v.setInt(id, "setPaintFlags", Paint.ANTI_ALIAS_FLAG | (on ? Paint.STRIKE_THRU_TEXT_FLAG : 0));
    }

    /** rows handed to each list widget, by widget id (WidgetShotsTest draws them: a test runner has no launcher to fill lists) */
    static final java.util.Map<Integer, java.util.List<RemoteViews>> lastRows = new java.util.HashMap<>();

    private static void list(Context c, RemoteViews v, int widgetId, RemoteViewsCompat.RemoteCollectionItems.Builder b, java.util.List<RemoteViews> rows) {
        lastRows.put(widgetId, rows);
        RemoteViewsCompat.setRemoteAdapter(c, v, widgetId, R.id.list, b.setHasStableIds(true).setViewTypeCount(1).build());
    }

    // ---------- 1. Today timeline ----------
    static RemoteViews timeline(Context c, int widgetId, JSONObject j, Theme t) {
        JSONArray rows = isToday(j) ? j.optJSONArray("rows") : null;
        int now = nowMin(), at = -1, left = 0;
        String nowText = "";
        RemoteViewsCompat.RemoteCollectionItems.Builder b = new RemoteViewsCompat.RemoteCollectionItems.Builder();
        java.util.List<RemoteViews> all = new java.util.ArrayList<>();
        for (int i = 0; rows != null && i < rows.length(); i++) {
            JSONObject r = rows.optJSONObject(i);
            if (r == null) continue;
            int start = r.optInt("start"), end = r.optInt("end");
            boolean done = "done".equals(r.optString("status")), live = start <= now && now < end, past = end <= now;
            if (!done && !past) left++;
            if (at < 0 && end > now) at = i; // first row that isn't over: scroll here
            if (live && nowText.isEmpty()) nowText = "Now: " + r.optString("title");
            int bg = col(r.optString("bg"), t.soft), ink = col(r.optString("ink"), t.ink);
            if (past) bg = blend(bg, t.dark ? 0xFF55546E : 0xFFD6D6DC); // past: greyed, text stays readable
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.item_row);
            v.setViewVisibility(R.id.band, live ? View.VISIBLE : View.GONE);
            v.setInt(R.id.band, "setColorFilter", t.band);
            v.setTextViewText(R.id.time, r.optString("time"));
            v.setTextColor(R.id.time, live ? t.ink : t.quiet);
            v.setTextViewText(R.id.end, r.optString("endTime"));
            v.setTextColor(R.id.end, t.quiet);
            v.setInt(R.id.boxBg, "setColorFilter", bg);
            v.setTextViewText(R.id.text, r.optString("title"));
            v.setTextColor(R.id.text, ink);
            strike(v, R.id.text, done);
            check(v, done, ink, bg);
            boolean item = "item".equals(r.optString("kind"));
            v.setOnClickFillInIntent(R.id.box, WidgetAction.open(item ? "/item/" + r.optString("id") : "/today"));
            v.setOnClickFillInIntent(R.id.chk, WidgetAction.tick(r.optString("kind"), r.optString("id"), r.optString("status")));
            b.addItem(r.optString("id").hashCode(), v);
            all.add(v);
        }
        String msg = status(c, j);
        if (msg.isEmpty()) msg = rows != null && rows.length() > 0 ? "Done for today." : "Nothing planned. Tap + to add.";
        String sub = j.optString("label", "") + (nowText.isEmpty() ? "" : " · " + nowText);
        RemoteViews v = frame(c, t, "Today", sub, left > 0 ? left + " left" : "", "/today", "/today?add", msg, 10);
        list(c, v, widgetId, b, all);
        if (at > 0) v.setScrollPosition(R.id.list, at);
        return v;
    }

    private static int blend(int a, int b) {
        return Color.rgb((Color.red(a) + Color.red(b) * 2) / 3, (Color.green(a) + Color.green(b) * 2) / 3, (Color.blue(a) + Color.blue(b) * 2) / 3);
    }

    // ---------- 2. Keep ----------
    static RemoteViews keep(Context c, int widgetId, JSONObject j, Theme t) {
        JSONArray notes = j.optJSONArray("notes");
        int n = notes == null ? 0 : notes.length();
        RemoteViewsCompat.RemoteCollectionItems.Builder b = new RemoteViewsCompat.RemoteCollectionItems.Builder();
        java.util.List<RemoteViews> all = new java.util.ArrayList<>();
        for (int i = 0; i < n; i++) {
            JSONObject note = notes.optJSONObject(i);
            String color = note.optString("color");
            boolean tinted = col(color, 0) != 0;
            int ink = tinted ? 0xFF00003D : t.ink, quiet = tinted ? 0xFF3D3D6B : t.quiet;
            String title = note.optString("title"), text = note.optString("text");
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.item_note);
            v.setInt(R.id.fill, "setColorFilter", tinted ? col(color, t.soft) : t.soft);
            v.setInt(R.id.edge, "setColorFilter", tinted ? 0x5500003D : (t.dark ? 0xFF3A3970 : 0x5500003D));
            v.setTextViewText(R.id.title, title);
            v.setTextColor(R.id.title, ink);
            v.setViewVisibility(R.id.title, title.isEmpty() ? View.INVISIBLE : View.VISIBLE);
            v.setViewVisibility(R.id.pin, note.optBoolean("pinned") ? View.VISIBLE : View.GONE);
            v.setInt(R.id.pin, "setColorFilter", quiet);
            v.setTextViewText(R.id.text, text);
            v.setTextColor(R.id.text, title.isEmpty() ? ink : quiet);
            v.setViewVisibility(R.id.text, text.isEmpty() ? View.GONE : View.VISIBLE);
            v.setOnClickFillInIntent(R.id.row, WidgetAction.open("/keep?note=" + note.optString("id")));
            b.addItem(note.optString("id").hashCode(), v);
            all.add(v);
        }
        String msg = status(c, j);
        if (msg.isEmpty()) msg = "No notes yet. Tap + to write one.";
        RemoteViews v = frame(c, t, "Keep", n > 0 ? "Recent notes · pinned first" : "", "", "/keep", "/keep?new", msg, 20);
        list(c, v, widgetId, b, all);
        return v;
    }

    // ---------- 3. Now and next ----------
    static RemoteViews nowNext(Context c, JSONObject j, Theme t) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_now);
        v.setImageViewResource(R.id.bg, t.cardRes());
        for (int id : new int[] {R.id.nowLabel, R.id.nowTime, R.id.nextLabel, R.id.nextTime}) v.setTextColor(id, t.quiet);
        v.setTextColor(R.id.nowTitle, t.ink);
        v.setTextColor(R.id.nextTitle, t.ink);
        v.setOnClickPendingIntent(R.id.content, Native.open(c, "/today", 30));
        String msg = status(c, j);
        JSONArray rows = isToday(j) ? j.optJSONArray("rows") : null;
        int now = nowMin();
        JSONObject cur = null, next = null;
        for (int i = 0; rows != null && i < rows.length(); i++) {
            JSONObject r = rows.optJSONObject(i);
            if (cur == null && r.optInt("start") <= now && now < r.optInt("end")) cur = r;
            else if (next == null && r.optInt("start") > now) next = r;
        }
        if (cur != null) {
            int s = cur.optInt("start"), e = cur.optInt("end");
            v.setTextViewText(R.id.nowLabel, "NOW");
            v.setTextViewText(R.id.nowTitle, cur.optString("title"));
            v.setTextViewText(R.id.nowTime, cur.optString("time") + "–" + cur.optString("endTime") + " · " + dur(e - now) + " left");
            v.setProgressBar(R.id.prog, 100, Math.max(0, Math.min(100, (now - s) * 100 / Math.max(1, e - s))), false);
            v.setViewVisibility(R.id.prog, View.VISIBLE);
        } else {
            v.setTextViewText(R.id.nowLabel, "NOW");
            v.setTextViewText(R.id.nowTitle, msg.isEmpty() ? "Free" : msg);
            v.setTextViewText(R.id.nowTime, next != null ? "Until " + next.optString("time") : msg.isEmpty() ? "Nothing else today" : "");
            v.setViewVisibility(R.id.prog, View.GONE);
        }
        if (next != null) {
            v.setTextViewText(R.id.nextTitle, next.optString("title"));
            v.setTextViewText(R.id.nextTime, next.optString("time") + " · in " + dur(next.optInt("start") - now));
            v.setViewVisibility(R.id.nextBox, View.VISIBLE);
        } else v.setViewVisibility(R.id.nextBox, cur != null ? View.VISIBLE : View.GONE);
        if (next == null && cur != null) {
            v.setTextViewText(R.id.nextTitle, "Nothing");
            v.setTextViewText(R.id.nextTime, "rest of today free");
        }
        return v;
    }

    // ---------- 4. Quick add ----------
    static RemoteViews quick(Context c, Theme t) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_quick);
        v.setImageViewResource(R.id.bg, t.cardRes());
        v.setInt(R.id.note, "setBackgroundResource", t.dark ? R.drawable.wpill_soft_dark : R.drawable.wpill_soft_light);
        v.setTextColor(R.id.note, t.ink);
        v.setOnClickPendingIntent(R.id.plan, Native.open(c, "/today?add", 40));
        v.setOnClickPendingIntent(R.id.note, Native.open(c, "/keep?new", 41));
        return v;
    }

    // ---------- 5. To do today ----------
    static RemoteViews todo(Context c, int widgetId, JSONObject j, Theme t) {
        JSONArray todos = isToday(j) ? j.optJSONArray("todos") : null;
        int left = 0;
        RemoteViewsCompat.RemoteCollectionItems.Builder b = new RemoteViewsCompat.RemoteCollectionItems.Builder();
        java.util.List<RemoteViews> all = new java.util.ArrayList<>();
        for (int i = 0; todos != null && i < todos.length(); i++) {
            JSONObject r = todos.optJSONObject(i);
            boolean done = "done".equals(r.optString("status"));
            if (!done) left++;
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.item_todo);
            check(v, done, t.ink, t.card);
            v.setInt(R.id.dot, "setColorFilter", col(r.optString("bg"), t.quiet));
            v.setTextViewText(R.id.text, r.optString("title"));
            v.setTextColor(R.id.text, done ? t.quiet : t.ink);
            strike(v, R.id.text, done);
            v.setOnClickFillInIntent(R.id.row, WidgetAction.open("/item/" + r.optString("id")));
            v.setOnClickFillInIntent(R.id.chk, WidgetAction.tick("item", r.optString("id"), r.optString("status")));
            b.addItem(r.optString("id").hashCode(), v);
            all.add(v);
        }
        String msg = status(c, j);
        if (msg.isEmpty()) msg = "Nothing without a time today.";
        RemoteViews v = frame(c, t, "To do today", "No time set", left > 0 ? left + " left" : "", "/today", "/today?add", msg, 50);
        list(c, v, widgetId, b, all);
        return v;
    }

    // ---------- 6. Countdowns ----------
    static RemoteViews countdown(Context c, int widgetId, JSONObject j, Theme t) {
        JSONArray cds = j.optJSONArray("countdowns");
        RemoteViewsCompat.RemoteCollectionItems.Builder b = new RemoteViewsCompat.RemoteCollectionItems.Builder();
        java.util.List<RemoteViews> all = new java.util.ArrayList<>();
        for (int i = 0; cds != null && i < cds.length(); i++) {
            JSONObject r = cds.optJSONObject(i);
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.item_count);
            int days = r.optInt("days");
            v.setInt(R.id.fill, "setColorFilter", col(r.optString("bg"), t.soft));
            v.setTextViewText(R.id.days, days == 0 ? "!" : String.valueOf(days));
            v.setTextColor(R.id.days, col(r.optString("ink"), t.ink));
            v.setTextViewText(R.id.title, r.optString("title"));
            v.setTextColor(R.id.title, t.ink);
            v.setTextViewText(R.id.text, r.optString("label") + " · " + r.optString("when"));
            v.setTextColor(R.id.text, days <= 3 ? t.ink : t.quiet);
            v.setOnClickFillInIntent(R.id.row, WidgetAction.open("/item/" + r.optString("id")));
            b.addItem(r.optString("id").hashCode(), v);
            all.add(v);
        }
        String msg = status(c, j);
        if (msg.isEmpty()) msg = "No countdowns in the next 60 days.";
        RemoteViews v = frame(c, t, "Countdowns", "Days left", "", "/", null, msg, 60);
        list(c, v, widgetId, b, all);
        return v;
    }

    // ---------- 7. Week ahead ----------
    static RemoteViews week(Context c, int widgetId, JSONObject j, Theme t) {
        JSONArray days = isToday(j) ? j.optJSONArray("days") : null;
        RemoteViewsCompat.RemoteCollectionItems.Builder b = new RemoteViewsCompat.RemoteCollectionItems.Builder();
        java.util.List<RemoteViews> all = new java.util.ArrayList<>();
        for (int i = 0; days != null && i < days.length(); i++) {
            JSONObject d = days.optJSONObject(i);
            int n = d.optInt("count");
            StringBuilder lines = new StringBuilder();
            JSONArray top = d.optJSONArray("top");
            for (int k = 0; top != null && k < top.length(); k++) {
                JSONObject x = top.optJSONObject(k);
                if (lines.length() > 0) lines.append('\n');
                String time = x.optString("time");
                lines.append(time.isEmpty() ? "All day" : time).append("  ").append(x.optString("title"));
            }
            if (n > 3) lines.append("\n+").append(n - 3).append(" more");
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.item_day);
            v.setTextViewText(R.id.day, d.optString("label"));
            v.setTextColor(R.id.day, t.ink);
            v.setTextViewText(R.id.count, n == 0 ? "Free" : n + (n == 1 ? " thing" : " things"));
            v.setTextColor(R.id.count, t.quiet);
            v.setTextViewText(R.id.text, lines.length() == 0 ? "—" : lines.toString());
            v.setTextColor(R.id.text, t.quiet);
            v.setOnClickFillInIntent(R.id.row, WidgetAction.open("/today?d=" + d.optString("date")));
            b.addItem(d.optString("date").hashCode(), v);
            all.add(v);
        }
        String msg = status(c, j);
        if (msg.isEmpty()) msg = "Open Life Tracker to load your week.";
        RemoteViews v = frame(c, t, "Week ahead", j.optString("label", ""), "", "/week", "/today?add", msg, 70);
        list(c, v, widgetId, b, all);
        return v;
    }

    // ---------- tick from a widget ----------
    /** done <-> todo. Show it at once (cache + redraw), then tell the server; the next sync settles the truth. */
    static void tick(Context c, String kind, String id, String status) {
        String next = "done".equals(status) ? "todo" : "done";
        JSONObject j = Native.cached(c);
        for (String key : new String[] {"rows", "todos"}) {
            JSONArray a = j.optJSONArray(key);
            for (int i = 0; a != null && i < a.length(); i++) {
                JSONObject r = a.optJSONObject(i);
                if (r != null && id.equals(r.optString("id"))) {
                    try {
                        r.put("status", next);
                    } catch (Exception ignored) {
                    }
                }
            }
        }
        Native.saveCache(c, j);
        updateAll(c);
        // shortcut: plain thread in the app process (it outlives the tap); a lost write is fixed by the next sync
        new Thread(() -> {
            boolean ok = false;
            try {
                ok = Native.patch(c, "/api/" + ("block".equals(kind) ? "blocks/" : "items/") + id, new JSONObject().put("status", next));
            } catch (Exception ignored) {
            }
            if (!ok) new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(c, "Couldn't save. Open Life Tracker and try again.", Toast.LENGTH_LONG).show());
            SyncWorker.now(c);
        }).start();
    }

    // ---------- providers: Android asks for a redraw (added, resized, every 30 min) ----------
    public static class Base extends AppWidgetProvider {
        @Override
        public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
            updateAll(c);
            SyncWorker.now(c);
        }

        @Override
        public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
            updateAll(c);
        }
    }

    public static class Timeline extends Base {}

    public static class Keep extends Base {}

    public static class NowNext extends Base {}

    public static class Quick extends Base {}

    public static class Todo extends Base {}

    public static class Countdown extends Base {}

    public static class Week extends Base {}
}
