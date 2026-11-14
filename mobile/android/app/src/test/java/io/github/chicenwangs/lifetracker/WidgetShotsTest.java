package io.github.chicenwangs.lifetracker;

import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;

import androidx.test.core.app.ApplicationProvider;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Calendar;
import java.util.Locale;

/**
 * Draws every widget, light and dark, from a sample sync to build/widget-shots/*.png (CI uploads them).
 * Real Android layout + RemoteViews code under Robolectric: catches crashes and lets a human look at the result.
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 35, qualifiers = "w411dp-h891dp-xxhdpi")
public class WidgetShotsTest {
    private final Context c = ApplicationProvider.getApplicationContext();

    private static JSONObject sample(String theme) throws Exception {
        Calendar n = Calendar.getInstance();
        int now = n.get(Calendar.HOUR_OF_DAY) * 60 + n.get(Calendar.MINUTE);
        String day = String.format(Locale.ROOT, "%04d-%02d-%02d", n.get(Calendar.YEAR), n.get(Calendar.MONTH) + 1, n.get(Calendar.DAY_OF_MONTH));
        JSONArray rows = new JSONArray()
                .put(row("b1", "block", now - 180, now - 120, "Gym", "done", "#F7C9A9", "#00003D"))
                .put(row("i1", "item", now - 30, now + 30, "Deep work: thesis chapter 3", "todo", "#C9D7F7", "#00003D"))
                .put(row("i2", "item", now + 60, now + 120, "Exam revision", "todo", "#F7A9C4", "#00003D"))
                .put(row("b2", "block", now + 150, now + 210, "Dinner with Sam", "todo", "#BFE8C8", "#00003D"));
        JSONArray notes = new JSONArray()
                .put(new JSONObject().put("id", "n1").put("title", "Groceries").put("text", "☑ milk\n☐ eggs\n☐ bread").put("pinned", true).put("color", "#FFF4B8").put("checklist", true))
                .put(new JSONObject().put("id", "n2").put("title", "").put("text", "Call the dentist about Tuesday, ask about the X-ray results too").put("pinned", false).put("color", JSONObject.NULL))
                .put(new JSONObject().put("id", "n3").put("title", "Ideas").put("text", "Widget for countdowns\nWeek strip").put("pinned", false).put("color", "#D7C9F7"));
        JSONArray todos = new JSONArray()
                .put(new JSONObject().put("id", "t1").put("title", "Pay rent").put("status", "todo").put("bg", "#F7C9A9"))
                .put(new JSONObject().put("id", "t2").put("title", "Reply to supervisor").put("status", "done").put("bg", "#C9D7F7"));
        JSONArray countdowns = new JSONArray()
                .put(new JSONObject().put("id", "c1").put("title", "Final exam").put("days", 3).put("label", "3 days left").put("when", "Tue 17 Nov").put("bg", "#F7A9C4").put("ink", "#00003D"))
                .put(new JSONObject().put("id", "c2").put("title", "Thesis due").put("days", 24).put("label", "24 days left").put("when", "Tue 8 Dec").put("bg", "#C9D7F7").put("ink", "#00003D"));
        JSONArray days = new JSONArray();
        String[] labels = {"Today", "Tomorrow", "Mon 16", "Tue 17", "Wed 18", "Thu 19", "Fri 20"};
        for (int i = 0; i < 7; i++)
            days.put(new JSONObject().put("date", day).put("label", labels[i]).put("count", i == 2 ? 0 : 4 - i % 3)
                    .put("top", i == 2 ? new JSONArray() : new JSONArray().put(new JSONObject().put("time", "09:00").put("title", "Lecture")).put(new JSONObject().put("time", "").put("title", "Laundry"))));
        return new JSONObject().put("day", day).put("label", "Sat 14 Nov 2026")
                .put("theme", new JSONObject().put("mode", theme).put("lightStart", "07:00").put("darkStart", "19:00"))
                .put("rows", rows).put("notes", notes).put("todos", todos).put("countdowns", countdowns).put("days", days)
                .put("reminders", new JSONArray());
    }

    private static JSONObject row(String id, String kind, int start, int end, String title, String status, String bg, String ink) throws Exception {
        return new JSONObject().put("id", id).put("kind", kind).put("start", start).put("end", end)
                .put("time", hhmm(start)).put("endTime", hhmm(end)).put("title", title).put("status", status).put("bg", bg).put("ink", ink);
    }

    private static String hhmm(int m) {
        m = ((m % 1440) + 1440) % 1440;
        return String.format(Locale.ROOT, "%02d:%02d", m / 60, m % 60);
    }

    private void shot(String name, RemoteViews rv, int wDp, int hDp) throws Exception {
        float d = c.getResources().getDisplayMetrics().density;
        int w = Math.round(wDp * d), h = Math.round(hDp * d);
        FrameLayout host = new FrameLayout(c);
        View v = rv.apply(c, host);
        host.addView(v, new FrameLayout.LayoutParams(w, h));
        host.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
        host.layout(0, 0, w, h);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        b.eraseColor(0xFF6A6A80); // a plain wallpaper, so card edges and shadows show
        host.draw(new Canvas(b));
        File dir = new File(System.getProperty("user.dir"), "build/widget-shots");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) {
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
    }

    @Test
    public void drawEveryWidget() throws Exception {
        for (String mode : new String[] {"light", "dark"}) {
            JSONObject j = sample(mode);
            Theme t = Theme.of(c, j);
            shot("timeline-" + mode, Widgets.timeline(c, 1, j, t), 360, 300);
            shot("keep-" + mode, Widgets.keep(c, 2, j, t), 280, 340);
            shot("now-" + mode, Widgets.nowNext(c, j, t), 360, 110);
            shot("quick-" + mode, Widgets.quick(c, t), 280, 100);
            shot("todo-" + mode, Widgets.todo(c, 3, j, t), 280, 220);
            shot("countdown-" + mode, Widgets.countdown(c, 4, j, t), 280, 220);
            shot("week-" + mode, Widgets.week(c, 5, j, t), 360, 340);
        }
        // never synced: every widget says so instead of crashing
        JSONObject empty = new JSONObject();
        Theme t = Theme.of(c, empty);
        shot("timeline-empty", Widgets.timeline(c, 6, empty, t), 360, 200);
        shot("now-empty", Widgets.nowNext(c, empty, t), 360, 110);
    }
}
