package io.github.chicenwangs.lifetracker;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * window.Capacitor.Plugins.Speech.listen({ preferOffline: true }) -> { text } for the Keep quick-note mic
 * (v4 PR 13). SpeechRecognizer with EXTRA_PREFER_OFFLINE: on-device recognition where the phone has the model,
 * nothing recorded or stored by the app. RECORD_AUDIO is asked on the first tap; the web UI shows a short
 * rationale before this call. stop() ends the current dictation.
 */
@CapacitorPlugin(name = "Speech", permissions = @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO }))
public class SpeechPlugin extends Plugin {
    private SpeechRecognizer recognizer;
    private PluginCall pending;

    @PluginMethod
    public void listen(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) {
            requestPermissionForAlias("mic", call, "micResult");
            return;
        }
        start(call);
    }

    @PermissionCallback
    private void micResult(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) start(call);
        else call.reject("Microphone is off for Life Tracker. Turn it on in Android settings.", "denied");
    }

    private void start(PluginCall call) {
        if (pending != null) {
            call.reject("Still listening.", "busy");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Speech recognition is not available on this phone.", "unavailable");
            return;
        }
        pending = call;
        getActivity().runOnUiThread(() -> {
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle p) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rms) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onPartialResults(Bundle partial) {}
                @Override public void onEvent(int type, Bundle params) {}

                @Override
                public void onResults(Bundle results) {
                    ArrayList<String> heard = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String text = heard != null && !heard.isEmpty() ? heard.get(0) : "";
                    if (text == null || text.trim().isEmpty()) fail("Didn't catch that. Try again.", "no-speech");
                    else succeed(text);
                }

                @Override
                public void onError(int error) {
                    switch (error) {
                        case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                            fail("Microphone is off for Life Tracker. Turn it on in Android settings.", "denied");
                            break;
                        case SpeechRecognizer.ERROR_NO_MATCH:
                        case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                            fail("Didn't catch that. Try again.", "no-speech");
                            break;
                        case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                            fail("Speech is busy. Try again.", "busy");
                            break;
                        default:
                            fail("Speech recognition stopped.", "error");
                    }
                }
            });
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            recognizer.startListening(i);
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) recognizer.stopListening();
        });
        call.resolve();
    }

    /** one live call at a time: take it, drop the recognizer, then answer. */
    private void succeed(String text) {
        PluginCall call = take();
        if (call == null) return;
        JSObject r = new JSObject();
        r.put("text", text);
        call.resolve(r);
    }

    private void fail(String message, String code) {
        PluginCall call = take();
        if (call != null) call.reject(message, code);
    }

    private PluginCall take() {
        PluginCall call = pending;
        pending = null;
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
        return call;
    }

    @Override
    protected void handleOnDestroy() {
        fail("Speech recognition stopped.", "error");
        super.handleOnDestroy();
    }
}
