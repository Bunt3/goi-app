/** Thin wrapper over the Web Speech API (speechSynthesis) for Japanese playback. */

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

const isJapanese = (v: SpeechSynthesisVoice) => /^ja([-_]|$)/i.test(v.lang);

/**
 * Japanese voices installed on this device. Voice lists load asynchronously
 * in Chromium and on Android, so this waits briefly for `voiceschanged`.
 */
export function japaneseVoices(timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
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
  if (ttsSupported()) window.speechSynthesis.cancel();
}
