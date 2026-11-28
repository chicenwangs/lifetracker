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
 * window.Capacitor.Plugins.Speech.listen({ preferOffline }) -> { text } for app/src/lib/client/speech.ts (card 13).
 * Android's own speech recognizer does the listening: the audio never reaches Life Tracker, is never written to
 * disk and is never uploaded by us. Text only, nothing stored. A second listen() while one is running stops it and
 * keeps what arrived so far, so the one mic button can start and stop (BREAKDOWN line 102).
 */
@CapacitorPlugin(
    name = "Speech",
    permissions = @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
)
public class Speech extends Plugin {
    private SpeechRecognizer recognizer;
    private PluginCall pending;
    private String heard = "";

    @PluginMethod
    public void listen(PluginCall call) {
        boolean preferOffline = Boolean.TRUE.equals(call.getBoolean("preferOffline", false));
        // SpeechRecognizer must be created and driven from the main thread; plugin calls arrive on a worker
        getActivity().runOnUiThread(() -> onListen(call, preferOffline));
    }

    private void onListen(PluginCall call, boolean preferOffline) {
        if (pending != null) { // tap again = stop: whatever text has arrived is kept
            PluginCall first = pending;
            pending = null;
            String text = heard;
            stopRecognizer();
            resolveText(first, text);
            call.resolve(new JSObject().put("text", ""));
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            // Android's own dialog; the app's rationale sheet came before this (card 13 C6)
            requestPermissionForAlias("microphone", call, "onMicPermission");
            return;
        }
        begin(call, preferOffline);
    }

    @PermissionCallback
    private void onMicPermission(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone is off for Life Tracker. Turn it on in Android settings.", "permission");
            return;
        }
        boolean preferOffline = Boolean.TRUE.equals(call.getBoolean("preferOffline", false));
        getActivity().runOnUiThread(() -> begin(call, preferOffline));
    }

    private void begin(PluginCall call, boolean preferOffline) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Speech isn't available on this phone.", "no_service");
            return;
        }
        heard = "";
        pending = call;
        recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        recognizer.setRecognitionListener(listener);
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        if (preferOffline) intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        try {
            recognizer.startListening(intent);
        } catch (RuntimeException e) { // e.g. another app holds the microphone
            fail("Speech failed. Try again.", "recognizer_error");
        }
    }

    private void stopRecognizer() {
        if (recognizer == null) return;
        recognizer.destroy(); // cancels; the call already resolved with what arrived
        recognizer = null;
    }

    private void resolveText(PluginCall call, String text) {
        call.resolve(new JSObject().put("text", text == null ? "" : text));
    }

    private void finish(String text) {
        PluginCall call = pending;
        pending = null;
        stopRecognizer();
        if (call != null) resolveText(call, text);
    }

    private void fail(String message, String code) {
        PluginCall call = pending;
        pending = null;
        stopRecognizer();
        if (call != null) call.reject(message, code);
    }

    private static String best(ArrayList<String> results) {
        return results == null || results.isEmpty() ? null : results.get(0);
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override
        public void onReadyForSpeech(Bundle params) {}

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {}

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {}

        @Override
        public void onPartialResults(Bundle partialResults) {
            String text = best(partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION));
            if (text != null && !text.trim().isEmpty()) heard = text;
        }

        @Override
        public void onResults(Bundle results) {
            String text = best(results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION));
            finish(text != null && !text.trim().isEmpty() ? text : heard);
        }

        @Override
        public void onError(int error) {
            if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)
                finish(""); // nothing heard: the note stays as it was (C8)
            else if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS)
                fail("Microphone is off for Life Tracker. Turn it on in Android settings.", "permission");
            else fail("Speech failed. Try again.", "recognizer_error");
        }

        @Override
        public void onEvent(int eventType, Bundle params) {}
    };

    /** leaving the app takes the button away, so the microphone must stop with it */
    @Override
    protected void handleOnPause() {
        if (pending != null) finish(heard);
    }

    @Override
    protected void handleOnDestroy() {
        if (pending != null) finish(heard);
        else stopRecognizer();
    }
}
