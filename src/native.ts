/**
 * The Android app's (Capacitor) native features, with the website's
 * behaviour as the fallback. `__NATIVE__` is fixed at build time, so the web
 * build drops every native branch and never loads `@capacitor/core`.
 */

interface GoiNativePlugin {
  saveDownload(options: { name: string; mime: string; text: string }): Promise<{ where: string }>;
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

/** True in the APK. */
export const isNative: boolean = __NATIVE__;

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
