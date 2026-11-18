package io.github.bunt3.goi;

import android.content.Context;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Japanese speech through Android's own TextToSpeech engine (the WebView has
 * no speechSynthesis). Only voices installed on the phone are used, never a
 * network voice, so the speech is made on the phone. (What the engine itself
 * reports to its maker is outside the app's control.)
 */
class Speech {

    interface Done {
        void ok();

        void fail(String message, String code);
    }

    interface Ready {
        void run(TextToSpeech tts);

        void fail(String message, String code);
    }

    private final Context context;
    private TextToSpeech tts;
    /** 0 not started, 1 starting, 2 ready, -1 no engine. */
    private int state = 0;
    private final List<Ready> waiting = new ArrayList<>();
    // Utterance callbacks arrive on the engine's thread; plugin calls on Capacitor's.
    private final Map<String, Done> utterances = new ConcurrentHashMap<>();

    Speech(Context context) {
        this.context = context.getApplicationContext();
    }

    /** Run `then` once the engine is up. `restart` re-reads the installed voices (after the owner adds one). */
    synchronized void withEngine(boolean restart, Ready then) {
        if (restart && state != 1) shutdown();
        if (state == 2) {
            then.run(tts);
            return;
        }
        waiting.add(then);
        if (state == 1) return;
        state = 1;
        tts = new TextToSpeech(context, (status) -> {
            List<Ready> queue;
            TextToSpeech engine;
            synchronized (Speech.this) {
                queue = new ArrayList<>(waiting);
                waiting.clear();
                if (status != TextToSpeech.SUCCESS) {
                    state = -1;
                    if (tts != null) tts.shutdown();
                    tts = null;
                } else {
                    state = 2;
                    tts.setOnUtteranceProgressListener(listener);
                }
                engine = tts;
            }
            for (Ready r : queue) {
                if (engine == null) r.fail("This phone has no text-to-speech engine.", "NO_ENGINE");
                else r.run(engine);
            }
        });
    }

    /** Japanese voices that are installed on the phone and need no connection. */
    static List<Voice> offlineJapanese(TextToSpeech tts) {
        List<Voice> out = new ArrayList<>();
        java.util.Set<Voice> all;
        try {
            all = tts.getVoices();
        } catch (Exception e) {
            all = null; // some engines throw before their voice list is ready
        }
        if (all == null) return out;
        for (Voice v : all) {
            if (v.getLocale() == null || !"ja".equals(v.getLocale().getLanguage())) continue;
            if (v.isNetworkConnectionRequired()) continue;
            if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
            out.add(v);
        }
        out.sort((a, b) -> a.getName().compareTo(b.getName()));
        return out;
    }

    void speak(TextToSpeech tts, String text, float rate, String voiceName, Done done) {
        List<Voice> voices = offlineJapanese(tts);
        if (voices.isEmpty()) {
            done.fail("No Japanese voice is installed on this phone.", "NO_VOICE");
            return;
        }
        Voice chosen = voices.get(0);
        for (Voice v : voices) if (v.getName().equals(voiceName)) chosen = v;
        tts.setVoice(chosen);
        tts.setSpeechRate(Math.max(0.3f, Math.min(rate, 2.5f)));
        String id = UUID.randomUUID().toString();
        utterances.put(id, done);
        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, id);
        // QUEUE_FLUSH stops anything still playing; that utterance then ends through onStop.
        if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, id) != TextToSpeech.SUCCESS) {
            utterances.remove(id);
            done.fail("Speech failed to start.", "SPEAK_FAILED");
        }
    }

    synchronized void stop() {
        if (state == 2 && tts != null) tts.stop();
    }

    synchronized void shutdown() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        tts = null;
        state = 0;
        for (Done d : utterances.values()) d.ok();
        utterances.clear();
    }

    private Done take(String id) {
        return id == null ? null : utterances.remove(id);
    }

    private final UtteranceProgressListener listener = new UtteranceProgressListener() {
        @Override
        public void onStart(String id) {}

        @Override
        public void onDone(String id) {
            Done d = take(id);
            if (d != null) d.ok();
        }

        @Override
        public void onStop(String id, boolean interrupted) {
            // Cut short by the next card or by Stop: not a failure.
            Done d = take(id);
            if (d != null) d.ok();
        }

        @Override
        @Deprecated
        public void onError(String id) {
            Done d = take(id);
            if (d != null) d.fail("Speech failed.", "SPEAK_FAILED");
        }

        @Override
        public void onError(String id, int errorCode) {
            Done d = take(id);
            if (d != null) d.fail("Speech failed (engine error " + errorCode + ").", "SPEAK_FAILED");
        }
    };
}
