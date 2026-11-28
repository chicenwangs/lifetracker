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
import com.getcapacitor.BridgeWebViewClient;

/** The app = the server's own pages in a WebView (Capacitor), plus widgets, reminder alarms and self-update. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle state) {
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(HapticsPlugin.class);
        registerPlugin(ThemeBarsPlugin.class);
        registerPlugin(SessionPlugin.class);
        registerPlugin(Speech.class);
        super.onCreate(state);
        String themeCookie = CookieManager.getInstance().getCookie(Native.base(this));
        boolean dark = themeCookie != null && themeCookie.contains("lt_theme=light") ? false
                : themeCookie != null && themeCookie.contains("lt_theme=dark") ? true
                : Theme.of(this, Native.cached(this)).dark;
        ThemeBarsPlugin.apply(this, dark);
        WebView w = getBridge().getWebView();

        // Back = web history back: closes the top sheet / dialog / menu first, then the page (#91, layers.ts).
        // Enabled only while there is web history, so at the first page the system takes Back and shows the
        // predictive back-to-home preview (enableOnBackInvokedCallback in the manifest).
        OnBackPressedCallback back = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                if (w.canGoBack()) w.goBack();
            }
        };
        getOnBackPressedDispatcher().addCallback(this, back);
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void doUpdateVisitedHistory(WebView v, String url, boolean reload) {
                super.doUpdateVisitedHistory(v, url, reload);
                back.setEnabled(v.canGoBack()); // pushState (sheets, dialogs) lands here too
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
        // text follows the system font size (Settings › Display › Font size), also when changed while away (#116)
        getBridge().getWebView().getSettings()
                .setTextZoom(Math.round(getResources().getConfiguration().fontScale * 100));
        Updater.maybePrompt(this);
    }

    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush(); // the worker reads the session cookie from disk
        SyncWorker.now(this); // widgets + alarms pick up what was just changed
    }

    /** widget / notification / shortcut taps carry a server path; ACTION_SEND shares text/link into Keep (#117) */
    private void openPath(Intent i) {
        if (i == null) return;
        if (Intent.ACTION_SEND.equals(i.getAction()) && "text/plain".equals(i.getType())) {
            String subj = i.getStringExtra(Intent.EXTRA_SUBJECT);
            String txt = i.getStringExtra(Intent.EXTRA_TEXT);
            i.setAction(Intent.ACTION_MAIN);
            Uri.Builder b = Uri.parse(Native.base(this) + "/keep").buildUpon().appendQueryParameter("share", "1");
            if (subj != null && !subj.isEmpty()) b.appendQueryParameter("title", subj);
            if (txt != null && !txt.isEmpty()) b.appendQueryParameter("text", txt);
            WebView w = getBridge().getWebView();
            final String url = b.build().toString();
            w.post(() -> w.loadUrl(url));
            return;
        }
        String p = i.getStringExtra("path");
        if (p == null || !p.startsWith("/") || p.startsWith("//")) return;
        i.removeExtra("path");
        WebView w = getBridge().getWebView();
        w.post(() -> w.loadUrl(Native.base(this) + p));
    }
}
