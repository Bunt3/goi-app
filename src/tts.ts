/**
 * Japanese playback. The website uses the Web Speech API (speechSynthesis);
 * the APK uses Android's own engine through `native.ts`, because Android's
 * WebView has no speechSynthesis.
 */
import { nativeSpeak, nativeStopSpeaking, nativeVoices } from './native';

/** What the screens need from a voice. A SpeechSynthesisVoice fits this shape. */
export interface TtsVoice {
  voiceURI: string;
  name: string;
  localService: boolean;
}

export function ttsSupported(): boolean {
  if (__NATIVE__) return true;
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

const isJapanese = (v: SpeechSynthesisVoice) => /^ja([-_]|$)/i.test(v.lang);

/**
 * Japanese voices installed on this device. Voice lists load asynchronously
 * in Chromium and on Android, so this waits briefly for `voiceschanged`.
 * In the APK, only voices that work offline; `refresh` re-reads the list
 * after the owner installs voice data.
 */
export async function japaneseVoices(timeoutMs = 2500, refresh = false): Promise<TtsVoice[]> {
  if (__NATIVE__) {
    try {
      const { voices } = await nativeVoices(refresh);
      return voices.map((v) => ({ voiceURI: v.id, name: v.label, localService: true }));
    } catch {
      return [];
    }
  }
  return webJapaneseVoices(timeoutMs);
}

function webJapaneseVoices(timeoutMs: number): Promise<SpeechSynthesisVoice[]> {
  if (!ttsSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const now = synth.getVoices().filter(isJapanese);
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener('voiceschanged', onChange);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(synth.getVoices().filter(isJapanese));
    };
    const onChange = () => {
      if (synth.getVoices().some(isJapanese)) finish();
    };
    synth.addEventListener('voiceschanged', onChange);
    // Some Android builds never fire voiceschanged; poll as well.
    const poll = setInterval(onChange, 250);
    const timer = setTimeout(finish, timeoutMs);
  });
}

export interface SpeakOptions {
  voiceURI: string | null;
  rate: number;
}

/** Speak Japanese text. Resolves when playback ends; rejects with a readable message on failure. */
export function speak(text: string, options: SpeakOptions): Promise<void> {
  if (__NATIVE__) {
    return nativeSpeak(text, options.rate, options.voiceURI).catch((err: unknown) => {
      throw new Error((err as Error)?.message || 'Speech failed.');
    });
  }
  return new Promise((resolve, reject) => {
    if (!ttsSupported()) {
      reject(new Error('This browser has no speech synthesis.'));
      return;
    }
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP'; // always set: Android often ignores `voice` and goes by lang
    const voice = synth.getVoices().find((v) => v.voiceURI === options.voiceURI && isJapanese(v));
    if (voice) u.voice = voice;
    u.rate = options.rate;
    u.onend = () => resolve();
    u.onerror = (e) => {
      // Cancelling (e.g. tapping Next mid-sentence) is not a failure.
      if (e.error === 'canceled' || e.error === 'interrupted') resolve();
      else reject(new Error(`Speech failed (${e.error}).`));
    };
    synth.speak(u);
  });
}

export function stopSpeaking(): void {
  if (__NATIVE__) void nativeStopSpeaking().catch(() => undefined);
  else if (ttsSupported()) window.speechSynthesis.cancel();
}
