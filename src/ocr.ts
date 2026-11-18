/**
 * On-device text recognition (tesseract.js, Japanese model). The engine and
 * model are loaded lazily from this app's own origin under ocr/ — about
 * 4–6 MB the first time, cached by the service worker after that. Images
 * never leave the device. The APK tries Google's ML Kit (bundled, on the
 * phone) first and uses this reader only if ML Kit fails.
 */
import type { Worker } from 'tesseract.js';
import { nativeRecognize } from './native';

export type OcrProgress = (stage: string, fraction: number) => void;

let worker: Promise<Worker> | null = null;
let progress: OcrProgress = () => undefined;

const STAGE: Record<string, string> = {
  'loading tesseract core': 'Loading the reader',
  'initializing tesseract': 'Starting the reader',
  'loading language traineddata': 'Loading the Japanese model',
  'initializing api': 'Starting the reader',
  'recognizing text': 'Reading',
};

async function getWorker(): Promise<Worker> {
  if (!worker) {
    const base = import.meta.env.BASE_URL + 'ocr/';
    worker = (async () => {
      const { createWorker } = await import('tesseract.js');
      const w = await createWorker('jpn', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base + 'core',
        langPath: base + 'lang',
        workerBlobURL: false,
        // The APK stores the model un-gzipped (see vite.config.ts).
        gzip: !__NATIVE__,
        // The service worker keeps these files; a second copy in IndexedDB would only cost space.
        cacheMethod: 'none',
        logger: (m: { status: string; progress: number }) => progress(STAGE[m.status] ?? m.status, m.progress),
      });
      await w.setParameters({ preserve_interword_spaces: '1' });
      return w;
    })();
    worker.catch(() => {
      worker = null; // allow a retry, e.g. after coming back online
    });
  }
  return worker;
}

/**
 * Read the text in an image. Rejects with a readable message if the engine
 * can't be loaded. In the APK, Google's ML Kit (on the phone, much better on
 * photos) reads it first; if that fails, the built-in reader below does.
 */
export async function recognize(image: HTMLCanvasElement, onProgress: OcrProgress): Promise<string> {
  if (__NATIVE__) {
    try {
      onProgress('Reading', 0);
      const text = await nativeRecognize(image.toDataURL('image/png'));
      onProgress('Reading', 1);
      return text;
    } catch (err) {
      console.warn('ML Kit could not read the image; using the built-in reader.', err);
    }
  }
  progress = onProgress;
  let w: Worker;
  try {
    w = await getWorker();
  } catch (err) {
    throw new Error(
      navigator.onLine === false
        ? 'The text reader hasn’t been downloaded yet and this device is offline. Connect once and try again; after that it works offline.'
        : `The text reader could not be loaded (${(err as Error)?.message ?? err}).`,
    );
  }
  const { data } = await w.recognize(image);
  return data.text;
}

/** Free the engine's memory (tens of MB) when leaving the capture screen. */
export async function disposeOcr(): Promise<void> {
  const current = worker;
  worker = null;
  if (current) await current.then((w) => w.terminate()).catch(() => undefined);
}
