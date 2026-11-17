/** The Dictionary section of the More screen: install, progress, remove, attribution. */
import { checkDict, dictStatus, installDict, mb, onDictStatus, removeDict, type DictStatus } from './dict';
import { h, plural, toast } from './dom';

export function dictSection(): { el: HTMLElement; destroy: () => void } {
  const body = h('div', { id: 'dict-panel', 'aria-live': 'polite' });

  function render(s: DictStatus): void {
    const parts: (HTMLElement | string)[] = [];
    switch (s.state) {
      case 'checking':
        parts.push(h('p', { class: 'muted small', id: 'dict-status' }, 'Checking…'));
        break;
      case 'unavailable':
        parts.push(h('p', { class: 'small', id: 'dict-status' }, s.reason));
        break;
      case 'available':
      case 'failed':
        parts.push(
          h(
            'p',
            { class: 'small', id: 'dict-status' },
            s.state === 'failed'
              ? `The download stopped: ${s.message}. Nothing else was affected; try again when the connection is steady.`
              : s.interrupted
                ? 'An earlier download did not finish. Download again to complete it.'
                : `Not downloaded. About ${mb(s.manifest.bytes)} to download, ${plural(s.manifest.entries, 'entry', 'entries')}. Use Wi-Fi if mobile data is limited.`,
          ),
          h('button', { class: 'primary block', id: 'dict-install', onclick: () => installDict(s.manifest) }, `Download dictionary (about ${mb(s.manifest.bytes)})`),
        );
        break;
      case 'installing': {
        const total = s.manifest.entries || 1;
        parts.push(
          h('p', { class: 'small', id: 'dict-status' }, `Installing… ${plural(s.entries, 'entry', 'entries')} of ${s.manifest.entries.toLocaleString()} (${mb(s.bytes)} downloaded).`),
          h('progress', { class: 'dict-progress', id: 'dict-progress', max: total, value: Math.min(s.entries, total) }),
          h('p', { class: 'muted small' }, 'You can keep using the app. Leaving this screen is fine; closing the app stops the download.'),
        );
        break;
      }
      case 'installed':
        parts.push(
          h(
            'p',
            { class: 'small', id: 'dict-status' },
            `Installed: ${plural(s.info.entries, 'entry', 'entries')}, ${new Date(s.info.installedAt).toLocaleDateString()}. Works offline.`,
          ),
          s.info.fixture ? h('p', { class: 'notice small' }, 'This build carries a small test dictionary, not the real one.') : '',
          s.update
            ? h('button', { class: 'block', id: 'dict-update', onclick: () => installDict(s.update!) }, `Download the newer version (about ${mb(s.update.bytes)})`)
            : '',
          h(
            'button',
            {
              class: 'link small',
              id: 'dict-remove',
              onclick: async () => {
                await removeDict();
                toast('Dictionary removed. Your cards are unchanged.');
              },
            },
            'Remove dictionary',
          ),
        );
        break;
    }
    body.replaceChildren(...parts);
  }

  render(dictStatus());
  const off = onDictStatus(render);
  void checkDict();

  const el = h(
    'section',
    { id: 'sec-dict' },
    h('h2', null, 'Dictionary'),
    h(
      'p',
      { class: 'small' },
      'Looks up words you pick from a sentence or type in, and fills in the reading and meaning (and an example sentence where there is none). ',
      'Filled cards carry the auto-filled tag so you can check them. It is stored apart from your cards and is never part of a backup.',
    ),
    body,
    h(
      'p',
      { class: 'muted small', id: 'dict-credit', style: 'margin-top:10px' },
      'Dictionary data: JMdict, by the Electronic Dictionary Research and Development Group (',
      h('a', { href: 'https://www.edrdg.org/edrdg/licence.html', target: '_blank', rel: 'noopener noreferrer' }, 'licence'),
      '), converted by ',
      h('a', { href: 'https://github.com/scriptin/jmdict-simplified', target: '_blank', rel: 'noopener noreferrer' }, 'jmdict-simplified'),
      '. Example sentences: the Tanaka Corpus, maintained by the ',
      h('a', { href: 'https://tatoeba.org/', target: '_blank', rel: 'noopener noreferrer' }, 'Tatoeba project'),
      '. The app opens these links only if you tap them.',
    ),
  );
  return { el, destroy: off };
}
