/**
 * APK only: More → Updates. The one request the app makes to another site,
 * and only when the owner presses the button: GitHub's "latest release".
 */
import { openInBrowser } from '../native';
import { LATEST_RELEASE_API, RELEASES_PAGE, plainNotes, readUpdateAnswer, type UpdateCheck } from '../update';
import { h, toast } from './dom';

async function check(): Promise<UpdateCheck> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetch(LATEST_RELEASE_API, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctl.signal,
    });
    const json: unknown = await res.json().catch(() => null);
    return readUpdateAnswer(__APP_SEMVER__, res.status, json, res.headers.get('x-ratelimit-remaining'));
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    return { status: 'failed', reason: aborted ? 'no answer within 15 seconds' : 'no connection' };
  } finally {
    clearTimeout(timer);
  }
}

function open(url: string): void {
  openInBrowser(url).catch((err: unknown) => toast(`Couldn’t open the browser (${(err as Error)?.message ?? err}).`, undefined, 6000));
}

function render(r: UpdateCheck): (HTMLElement | string)[] {
  switch (r.status) {
    case 'current':
      return [h('p', { class: 'small', id: 'update-status' }, `You have the latest version (${r.installed}).`)];
    case 'available':
      return [
        h('p', { class: 'small', id: 'update-status' }, `Version ${r.latest.version} is available. You have ${r.installed}.`),
        r.latest.notes
          ? h(
              'details',
              { style: 'margin-bottom:10px' },
              h('summary', null, 'What’s new'),
              h('div', { class: 'small', 'data-content': '', style: 'white-space:pre-wrap;margin-top:6px' }, plainNotes(r.latest.notes)),
            )
          : '',
        h('button', { class: 'primary block', id: 'update-download', onclick: () => open(r.latest.apk || r.latest.page) }, `Download ${r.latest.version}`),
        h(
          'p',
          { class: 'muted small' },
          'The download opens in your browser. Open the downloaded file to install; Android asks you to confirm the update. Your cards stay. Export a backup first if you want to be safe.',
        ),
      ];
    case 'not-visible':
      return [
        h(
          'p',
          { class: 'small', id: 'update-status' },
          'GitHub didn’t show a release. While the repository is private, the app can’t see its releases. Open the releases page in a browser where you are logged in to GitHub.',
        ),
        h('button', { class: 'block', id: 'update-page', onclick: () => open(RELEASES_PAGE) }, 'Open the releases page'),
      ];
    case 'rate-limited':
      return [h('p', { class: 'small', id: 'update-status' }, 'GitHub limits how often it answers without a login. Try again in an hour.')];
    case 'failed':
      return [
        h('p', { class: 'small', id: 'update-status' }, `Couldn’t check (${r.reason}). Try again when the connection is steady.`),
        h('button', { class: 'block', id: 'update-page', onclick: () => open(RELEASES_PAGE) }, 'Open the releases page'),
      ];
  }
}

export function updateSection(): HTMLElement {
  const result = h('div', { id: 'update-result', 'aria-live': 'polite' });
  const button = h('button', { class: 'block', id: 'update-check' }, 'Check for updates') as HTMLButtonElement;
  button.addEventListener('click', async () => {
    button.disabled = true;
    result.replaceChildren(h('p', { class: 'muted small' }, 'Asking GitHub…'));
    const r = await check();
    result.replaceChildren(...render(r));
    button.disabled = false;
  });
  return h(
    'section',
    { id: 'sec-update' },
    h('h2', null, 'Updates'),
    h(
      'p',
      { class: 'small' },
      `This is Goi ${__APP_SEMVER__}. Check for updates asks GitHub for the newest release. It is the only time the app contacts another site, and it happens only when you press the button.`,
    ),
    button,
    result,
  );
}
