/**
 * The Android app's (Capacitor) native features, with the website's
 * behaviour as the fallback. `__NATIVE__` is fixed at build time, so the web
 * build drops every native branch and never loads `@capacitor/core`.
 */

/** Text handed to the app by Android: the text-selection menu or the share sheet. */
export interface AppShare {
  text: string;
  /** EXTRA_SUBJECT: often the page title when a browser shares. */
  subject: string;
  /** The sending app's name, '' if Android didn't say. */
  app: string;
}

export interface NativeVoice {
  id: string;
  label: string;
}

interface GoiNativePlugin {
  saveDownload(options: { name: string; mime: string; text: string }): Promise<{ where: string }>;
  ttsVoices(options: { refresh: boolean }): Promise<{ voices: NativeVoice[]; engine?: string; problem?: string }>;
  speak(options: { text: string; rate: number; voice: string }): Promise<void>;
  stopSpeaking(): Promise<void>;
  openTtsSettings(): Promise<void>;
  takeShare(): Promise<{ share?: AppShare }>;
  addListener(event: 'share', fn: () => void): Promise<{ remove: () => Promise<void> }>;
}

// Never resolve a promise *with* the plugin: Capacitor's plugin proxy answers
// every property, including `then`, so awaiting it would call a native
// method named "then". Keep it in a variable and resolve to nothing.
let plugin: GoiNativePlugin | null = null;
let loading: Promise<void> | null = null;

async function goiNative(): Promise<void> {
  loading ??= import('@capacitor/core').then(({ registerPlugin }) => {
    plugin = registerPlugin<GoiNativePlugin>('GoiNative');
  });
  await loading;
}

/**
 * APK only: write a text file to Downloads (Android 10+) or to a place the
 * owner picks (older Android). Android's WebView ignores download links, so
 * the website's way does nothing there. Resolves to where the file went;
 * rejects if it was not saved.
 */
export async function nativeSave(name: string, text: string, mime: string): Promise<string> {
  await goiNative();
  const { where } = await plugin!.saveDownload({ name, mime, text });
  return where;
}

/** APK only: offline Japanese voices. `refresh` re-reads them after the owner installs one. */
export async function nativeVoices(refresh = false): Promise<{ voices: NativeVoice[]; problem?: string }> {
  await goiNative();
  const r = await plugin!.ttsVoices({ refresh });
  return { voices: r.voices ?? [], problem: r.problem };
}

/** APK only: speak; resolves when done or cut short, rejects with a readable message. */
export async function nativeSpeak(text: string, rate: number, voice: string | null): Promise<void> {
  await goiNative();
  await plugin!.speak({ text, rate, voice: voice ?? '' });
}

export async function nativeStopSpeaking(): Promise<void> {
  await goiNative();
  await plugin!.stopSpeaking();
}

/** APK only: the phone's text-to-speech settings, to install Japanese voice data. */
export async function openTtsSettings(): Promise<void> {
  await goiNative();
  await plugin!.openTtsSettings();
}

/** APK only: text Android handed over, once; null if none is waiting. */
export async function takeAppShare(): Promise<AppShare | null> {
  await goiNative();
  return (await plugin!.takeShare()).share ?? null;
}

/** APK only: called when text arrives while the app is already open. */
export async function onAppShare(fn: () => void): Promise<void> {
  await goiNative();
  await plugin!.addListener('share', fn);
}
