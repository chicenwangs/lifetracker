package io.github.chicenwangs.lifetracker;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/** The app = the server's own pages in a WebView (Capacitor), plus widgets, reminder alarms and self-update. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle state) {
        registerPlugin(UpdaterPlugin.class);
        super.onCreate(state);
        WebView w = getBridge().getWebView();

        // Android back = page back; at the first page, leave the app
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (w.canGoBack()) {
                    w.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });

        // attachment downloads (the WebView ignores them by default); the session cookie goes along
        w.setDownloadListener((url, ua, disposition, mime, length) -> {
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url))
                        .addRequestHeader("User-Agent", ua)
                        .setMimeType(mime)
                        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, disposition, mime));
                String ck = CookieManager.getInstance().getCookie(url);
                if (ck != null) r.addRequestHeader("Cookie", ck);
                getSystemService(DownloadManager.class).enqueue(r);
                Toast.makeText(this, "Downloading…", Toast.LENGTH_SHORT).show();
            } catch (Exception e) { // Android 8–9 without storage permission
                Toast.makeText(this, "Couldn't download. Open it in a browser instead.", Toast.LENGTH_LONG).show();
            }
        });

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        Reminders.channel(this);
        SyncWorker.schedule(this);
        openPath(getIntent());
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        openPath(i);
    }

    @Override
    public void onResume() {
        super.onResume();
        Updater.maybePrompt(this);
    }

    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush(); // the worker reads the session cookie from disk
        SyncWorker.now(this); // widgets + alarms pick up what was just changed
    }

    /** widget / notification taps carry a server path to open */
    private void openPath(Intent i) {
        String p = i == null ? null : i.getStringExtra("path");
        if (p == null || !p.startsWith("/")) return;
        i.removeExtra("path");
        WebView w = getBridge().getWebView();
        w.post(() -> w.loadUrl(Native.base(this) + p));
    }
}
