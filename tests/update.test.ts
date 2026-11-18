import { describe, expect, it } from 'vitest';
import { compareVersions, parseRelease, plainNotes, readUpdateAnswer } from '../src/update';

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  name: `Goi ${tag.slice(5)} (Android)`,
  body: 'New in this version',
  html_url: `https://github.com/Bunt3/goi-app/releases/tag/${tag}`,
  assets: [
    { name: `goi-${tag.slice(5)}.apk.sha256`, browser_download_url: 'https://github.com/x.sha256' },
    { name: `goi-${tag.slice(5)}.apk`, browser_download_url: `https://github.com/Bunt3/goi-app/releases/download/${tag}/goi-${tag.slice(5)}.apk` },
  ],
  ...extra,
});

describe('update check', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.2')).toBe(1);
    expect(compareVersions('1.2.0', '1.2')).toBe(0);
    expect(compareVersions('v1.2.0', '1.3.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });

  it('reads an APK release and picks the .apk asset, not the checksum', () => {
    const r = parseRelease(release('apk-v1.4.0'))!;
    expect(r.version).toBe('1.4.0');
    expect(r.apk).toBe('https://github.com/Bunt3/goi-app/releases/download/apk-v1.4.0/goi-1.4.0.apk');
    expect(r.page).toBe('https://github.com/Bunt3/goi-app/releases/tag/apk-v1.4.0');
    expect(r.notes).toBe('New in this version');
  });

  it('ignores releases that are not APK releases, and links that leave github.com', () => {
    expect(parseRelease(release('v2.0.0'))).toBeNull();
    expect(parseRelease(null)).toBeNull();
    const odd = parseRelease(release('apk-v1.4.0', { html_url: 'https://evil.example/x', assets: [{ name: 'goi-1.4.0.apk', browser_download_url: 'https://evil.example/goi.apk' }] }))!;
    expect(odd.apk).toBe('');
    expect(odd.page).toBe('https://github.com/Bunt3/goi-app/releases/tag/apk-v1.4.0');
  });

  it('says whether a newer version exists', () => {
    expect(readUpdateAnswer('1.3.0', 200, release('apk-v1.4.0')).status).toBe('available');
    expect(readUpdateAnswer('1.4.0', 200, release('apk-v1.4.0')).status).toBe('current');
    expect(readUpdateAnswer('1.5.0', 200, release('apk-v1.4.0')).status).toBe('current');
  });

  it('explains what GitHub could not answer', () => {
    // Private repository, or no release yet: anonymous requests get 404.
    expect(readUpdateAnswer('1.3.0', 404, { message: 'Not Found' })).toEqual({ status: 'not-visible' });
    expect(readUpdateAnswer('1.3.0', 403, {}, '0')).toEqual({ status: 'rate-limited' });
    expect(readUpdateAnswer('1.3.0', 500, {})).toEqual({ status: 'failed', reason: 'GitHub answered 500' });
    expect(readUpdateAnswer('1.3.0', 200, release('v9.0.0')).status).toBe('failed');
  });

  it('shows release notes as plain text', () => {
    expect(plainNotes('## New in 1.4.0\r\n\n- **Folder backups.** Pick a folder in `More`.\n')).toBe('New in 1.4.0\n\n- Folder backups. Pick a folder in More.');
  });
});
