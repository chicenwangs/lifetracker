package io.github.chicenwangs.lifetracker;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app update for the app shell itself. Pages always come fresh from the server; only native code (widgets,
 * alarms) needs a new APK. Source = the newest GitHub Release's life-tracker-X.Y.Z.apk. Android only installs it if
 * it is signed with the same key as this app, so a swapped file can't take over.
 */
final class Updater {
    private Updater() {}

    static final String LATEST = "https://api.github.com/repos/chicenwangs/lifetracker/releases/latest";
    private static final long EVERY_MS = 6 * 3_600_000L;

    /** {version, apkUrl} of the newest release with an APK, or null (offline, none yet) */
    static String[] latest(Activity a) {
        JSONObject r = Native.get(a, LATEST, false);
        if (r == null) return null;
        String v = r.optString("tag_name").replaceFirst("^v", "");
        JSONArray assets = r.optJSONArray("assets");
        for (int i = 0; assets != null && i < assets.length(); i++) {
            JSONObject x = assets.optJSONObject(i);
            if (x != null && x.optString("name").endsWith(".apk")) return new String[] {v, x.optString("browser_download_url")};
        }
        return null;
    }

    /** "2.0.3" -> 20003 (same rule as versionCode in build.gradle) */
    static int code(String v) {
        String[] p = v.split("\\.");
        try {
            return Integer.parseInt(p[0]) * 10000 + Integer.parseInt(p[1]) * 100 + Integer.parseInt(p[2]);
        } catch (Exception e) {
            return 0;
        }
    }

    static boolean newer(String v) {
        return code(v) > BuildConfig.VERSION_CODE;
    }

    /** on resume, at most every 6 h: ask once if a newer app is out */
    static void maybePrompt(Activity a) {
        android.content.SharedPreferences p = a.getSharedPreferences(Native.PREFS, 0);
        long t = System.currentTimeMillis();
        if (t - p.getLong("updateCheck", 0) < EVERY_MS) return;
        p.edit().putLong("updateCheck", t).apply();
        new Thread(() -> {
            String[] r = latest(a);
            if (r == null || !newer(r[0])) return;
            a.runOnUiThread(() -> {
                if (a.isFinishing()) return;
                new AlertDialog.Builder(a)
                        .setTitle("Update Life Tracker")
                        .setMessage("Version " + r[0] + " is out (you have " + BuildConfig.VERSION_NAME + "). Update now?")
                        .setPositiveButton("Update", (d, w) -> install(a, r))
                        .setNegativeButton("Later", null)
                        .show();
            });
        }).start();
    }

    /** download the APK, then hand it to Android's installer (it asks the user to confirm) */
    static void install(Activity a, String[] r) {
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(a, "Allow Life Tracker to install updates, then tap Update again.", Toast.LENGTH_LONG).show();
            a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName())));
            return;
        }
        Toast.makeText(a, "Downloading update…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            File dir = new File(a.getCacheDir(), "updates");
            File f = new File(dir, "life-tracker-" + r[0] + ".apk");
            try {
                dir.mkdirs();
                HttpURLConnection h = (HttpURLConnection) new URL(r[1]).openConnection(); // follows GitHub's redirect to its CDN
                h.setConnectTimeout(15_000);
                h.setReadTimeout(60_000);
                try (InputStream in = h.getInputStream(); FileOutputStream out = new FileOutputStream(f)) {
                    byte[] buf = new byte[65536];
                    for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                } finally {
                    h.disconnect();
                }
                Uri uri = FileProvider.getUriForFile(a, a.getPackageName() + ".fileprovider", f);
                Intent i = new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(uri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                a.runOnUiThread(() -> a.startActivity(i));
            } catch (Exception e) {
                f.delete();
                a.runOnUiThread(() -> Toast.makeText(a, "Update download failed. Try again later.", Toast.LENGTH_LONG).show());
            }
        }).start();
    }
}
