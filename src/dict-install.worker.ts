/// <reference lib="webworker" />
/**
 * Downloads the dictionary file from this app's own origin and writes it
 * into the 'goi-dict' database, off the main thread so the UI stays usable.
 */
import { DictDB, installLines, streamLines } from './dictdb';
import type { DictManifest } from './dict/entry';

export type InstallRequest = { url: string; manifest: DictManifest };
export type InstallMessage =
  | { type: 'progress'; entries: number; bytes: number }
  | { type: 'done'; entries: number }
  | { type: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: InstallMessage) => scope.postMessage(m);

scope.onmessage = async (e: MessageEvent<InstallRequest>) => {
  const { url, manifest } = e.data;
  const db = new DictDB();
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok || !res.body) throw new Error(`the server answered ${res.status}`);
    let bytes = 0;
    const counted = res.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, c) {
          bytes += chunk.byteLength;
          c.enqueue(chunk);
        },
      }),
    );
    const entries = await installLines(db, manifest, streamLines(counted), (n) => post({ type: 'progress', entries: n, bytes }));
    post({ type: 'done', entries });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    db.close();
  }
};
