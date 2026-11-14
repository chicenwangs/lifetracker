package io.github.chicenwangs.lifetracker;

import android.content.Context;
import android.content.res.Configuration;

import org.json.JSONObject;

import java.util.Calendar;

/** Widget colours. Follows the account's Light / Dark / Auto setting (app.css tokens), like the app itself. */
final class Theme {
    final boolean dark;
    final int card, ink, quiet, band, soft, accent = 0xFFF3D053;

    private Theme(boolean dark) {
        this.dark = dark;
        card = dark ? 0xFF17163A : 0xFFFFFFFF;
        ink = dark ? 0xFFF3F1FA : 0xFF00003D;
        quiet = dark ? 0xFFB7B5D6 : 0xFF3D3D6B;
        band = dark ? 0xFF2C2B5E : 0xFFECECF0; // the row happening now (same as Today)
        soft = dark ? 0xFF201F48 : 0xFFF3F2FA;
    }

    /** the card behind a whole widget: border + the app's hard yellow shadow */
    int cardRes() {
        return dark ? R.drawable.wcard_dark : R.drawable.wcard_light;
    }

    static Theme of(Context c, JSONObject sync) {
        JSONObject t = sync.optJSONObject("theme");
        String mode = t == null ? "" : t.optString("mode");
        if (mode.equals("light")) return new Theme(false);
        if (mode.equals("dark")) return new Theme(true);
        if (mode.equals("auto")) {
            // same rule as lib/theme.ts: light from lightStart until darkStart (wraps past midnight)
            int l = min(t.optString("lightStart", "07:00")), d = min(t.optString("darkStart", "19:00"));
            Calendar now = Calendar.getInstance();
            int m = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
            boolean light = l != d && (l < d ? m >= l && m < d : m >= l || m < d);
            return new Theme(!light);
        }
        // never synced: follow the phone
        int night = c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return new Theme(night == Configuration.UI_MODE_NIGHT_YES);
    }

    private static int min(String hhmm) {
        try {
            return Integer.parseInt(hhmm.substring(0, 2)) * 60 + Integer.parseInt(hhmm.substring(3, 5));
        } catch (Exception e) {
            return 0;
        }
    }
}
