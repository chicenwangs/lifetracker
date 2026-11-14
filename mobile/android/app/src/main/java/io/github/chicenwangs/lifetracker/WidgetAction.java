package io.github.chicenwangs.lifetracker;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

/**
 * Invisible stop for taps inside scrolling widget lists (one click template per list, rows add their extras):
 * "open" forwards to the app on a path, "tick" marks done / not done and closes at once.
 * An activity, not a broadcast: Android blocks starting the app from a broadcast receiver.
 */
public class WidgetAction extends Activity {
    static PendingIntent template(Context c, int requestCode) {
        // mutable: each row fills in its own extras
        return PendingIntent.getActivity(c, requestCode, new Intent(c, WidgetAction.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    }

    static Intent open(String path) {
        return new Intent().putExtra("do", "open").putExtra("path", path);
    }

    static Intent tick(String kind, String id, String status) {
        return new Intent().putExtra("do", "tick").putExtra("kind", kind).putExtra("id", id).putExtra("status", status);
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Intent i = getIntent();
        String what = i.getStringExtra("do");
        if ("open".equals(what)) {
            String path = i.getStringExtra("path");
            if (path != null && path.startsWith("/"))
                startActivity(new Intent(this, MainActivity.class).setAction(Intent.ACTION_VIEW).putExtra("path", path).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        } else if ("tick".equals(what) && i.getStringExtra("id") != null) {
            Widgets.tick(getApplicationContext(), i.getStringExtra("kind"), i.getStringExtra("id"), i.getStringExtra("status"));
        }
        finish();
        overridePendingTransition(0, 0);
    }
}
