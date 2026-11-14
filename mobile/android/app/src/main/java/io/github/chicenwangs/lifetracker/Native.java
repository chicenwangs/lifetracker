package io.github.chicenwangs.lifetracker;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.webkit.CookieManager;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Shared bits: server address, GET with the WebView's sign-in cookie, cached sync, open-a-page intents. */
final class Native {
    private Native() {}

    static final String PREFS = "lt";

    static String base(Context c) {
        return c.getString(R.string.server_url);
    }

    /** GET a JSON object. Server calls carry the WebView session cookie. null = offline, signed out or error. */
    static JSONObject get(Context c, String url, boolean signedIn) {
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(url).openConnection();
            h.setConnectTimeout(10_000);
            h.setReadTimeout(20_000);
            h.setRequestProperty("Accept", "application/json");
            if (signedIn) {
                String ck = CookieManager.getInstance().getCookie(url);
                if (ck != null) h.setRequestProperty("Cookie", ck);
            }
            if (h.getResponseCode() != 200) return null;
            try (InputStream in = h.getInputStream()) {
                return new JSONObject(new String(readAll(in), StandardCharsets.UTF_8));
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (h != null) h.disconnect();
        }
    }

    static byte[] readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        return out.toByteArray();
    }

    /** last /api/native answer (widgets draw from it); empty object = never synced */
    static JSONObject cached(Context c) {
        try {
            return new JSONObject(c.getSharedPreferences(PREFS, 0).getString("sync", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    /** tap target: opens the app on a server path, e.g. /today or /keep?note=… */
    static PendingIntent open(Context c, String path, int requestCode) {
        Intent i = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .putExtra("path", path)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
