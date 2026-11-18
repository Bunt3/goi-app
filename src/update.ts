/**
 * The APK's update check, pure part: what GitHub's "latest release" answer
 * means for the installed version. The request itself is made only when the
 * owner presses the button (ui/update.ts), and only in the APK.
 */

export const REPO = 'Bunt3/goi-app';
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface Release {
  version: string;
  tag: string;
  title: string;
  notes: string;
  /** The page of this release. */
  page: string;
  /** Direct download of the APK, '' if the release has none. */
  apk: string;
}

export type UpdateCheck =
  | { status: 'current'; installed: string; latest: Release }
  | { status: 'available'; installed: string; latest: Release }
  /** GitHub answered 404: no release yet, or the repository is private (anonymous requests can't see it). */
  | { status: 'not-visible' }
  | { status: 'rate-limited' }
  | { status: 'failed'; reason: string };

/** Compare dotted versions numerically ("1.10.0" > "1.9.2"). Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Read GitHub's release JSON. Only APK releases (tag apk-v…) count. */
export function parseRelease(json: unknown): Release | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Record<string, unknown>;
  const tag = typeof r.tag_name === 'string' ? r.tag_name : '';
  const m = /^apk-v(\d+(?:\.\d+)*)$/.exec(tag);
  if (!m) return null;
  const assets = Array.isArray(r.assets) ? (r.assets as Record<string, unknown>[]) : [];
  const apk = assets.find((a) => typeof a?.name === 'string' && /^goi-[\d.]+\.apk$/.test(a.name));
  const url = (v: unknown) => (typeof v === 'string' && v.startsWith('https://github.com/') ? v : '');
  return {
    version: m[1]!,
    tag,
    title: typeof r.name === 'string' && r.name ? r.name : tag,
    notes: typeof r.body === 'string' ? r.body : '',
    page: url(r.html_url) || `${RELEASES_PAGE}/tag/${tag}`,
    apk: url(apk?.browser_download_url),
  };
}

/** Turn the HTTP answer into what to tell the owner. */
export function readUpdateAnswer(installed: string, status: number, json: unknown, rateRemaining: string | null = null): UpdateCheck {
  if (status === 404) return { status: 'not-visible' };
  if ((status === 403 || status === 429) && rateRemaining === '0') return { status: 'rate-limited' };
  if (status < 200 || status >= 300) return { status: 'failed', reason: `GitHub answered ${status}` };
  const latest = parseRelease(json);
  if (!latest) return { status: 'failed', reason: 'the latest release is not an Android release' };
  return { status: compareVersions(latest.version, installed) > 0 ? 'available' : 'current', installed, latest };
}

/** Release notes are Markdown; show them as plain text (headings, bold and code marks removed). */
export function plainNotes(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .trim();
}
