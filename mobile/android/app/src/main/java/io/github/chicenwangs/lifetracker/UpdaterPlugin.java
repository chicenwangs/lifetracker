package io.github.chicenwangs.lifetracker;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** window.Capacitor.Plugins.Updater for Settings › Help: check() and install(). */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    private String[] found;

    @PluginMethod
    public void check(PluginCall call) {
        new Thread(() -> {
            found = Updater.latest(getActivity());
            JSObject o = new JSObject();
            o.put("current", BuildConfig.VERSION_NAME);
            if (found != null) {
                o.put("latest", found[0]);
                o.put("available", Updater.newer(found[0]));
            }
            call.resolve(o);
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        if (found == null || !Updater.newer(found[0])) {
            call.reject("No update to install. Check first.");
            return;
        }
        getActivity().runOnUiThread(() -> Updater.install(getActivity(), found));
        call.resolve();
    }
}
