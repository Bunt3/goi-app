/** Keigo training (#/keigo): short drills on turning plain speech into office keigo. */
import { VERBS } from '../data/keigo';
import { allItems, keigoStats, grade, pickSession, type KeigoItem } from '../keigo';
import { go, refresh, store, type View } from './app';
import { h } from './dom';

const SESSION = 10;

export function keigoView(arg: string): View {
  return arg === 'go' ? sessionView() : introView();
}

function introView(): View {
  const items = allItems();
  const st = keigoStats(items, store.settings.keigo, Date.now());
  const table = h(
    'details',
    { style: 'margin-top:16px' },
    h('summary', null, 'All verb forms'),
    h(
      'table',
      { class: 'keigo-table small', lang: 'ja', 'data-content': '' },
      h('thead', null, h('tr', null, h('th', null, '普通'), h('th', null, '尊敬語'), h('th', null, '謙譲語'))),
      h(
        'tbody',
        null,
        VERBS.map(([, plain, , , son, ken]) => h('tr', null, h('td', null, plain), h('td', null, son || '—'), h('td', null, ken || '—'))),
      ),
    ),
  );
  return {
    el: h(
      'div',
      { class: 'page' },
      h('h1', null, 'Keigo training'),
      h(
        'p',
        null,
        'Short drills on the skill behind keigo: turning plain speech into 尊敬語 and 謙譲語, telling which is which, and spotting common mistakes such as double keigo. Separate from your decks and their daily limits.',
      ),
      h(
        'dl',
        { class: 'kv small', id: 'keigo-stats' },
        h('dt', null, 'Drills'),
        h('dd', null, st.total),
        h('dt', null, 'Practised'),
        h('dd', null, st.seen),
        h('dt', null, 'Solid'),
        h('dd', null, st.mastered),
        h('dt', null, 'Due again'),
        h('dd', null, st.due),
      ),
      h('button', { class: 'primary big', id: 'keigo-start', style: 'margin-top:12px', onclick: () => go('keigo/go') }, `Start · ${SESSION} drills`),
      h('p', { class: 'muted small' }, 'Missed drills come back in the next session; correct ones come back after longer and longer gaps.'),
      table,
      h('p', { class: 'muted small', style: 'margin-top:16px' }, 'Forms follow the Agency for Cultural Affairs guidelines (敬語の指針, 2007) as summarised by business-manner guides. Written with AI help and not yet checked by a native speaker; checker mode doesn’t cover these.'),
    ),
  };
}

function sessionView(): View {
  const items = allItems();
  const now = Date.now();
  const queue = pickSession(items, store.settings.keigo, now, SESSION);
  let i = 0;
  let right = 0;
  const body = h('div', { id: 'keigo-card' });
  const progress = h('p', { class: 'muted small', id: 'keigo-progress' });

  async function record(item: KeigoItem, correct: boolean): Promise<void> {
    if (correct) right++;
    const keigo = { ...store.settings.keigo, [item.id]: grade(store.settings.keigo[item.id], correct, Date.now()) };
    await store.setSettings({ keigo });
  }

  function next(): void {
    i++;
    show();
  }

  function feedback(correct: boolean | null, lines: (HTMLElement | null)[], onNext: () => void): HTMLElement {
    return h(
      'div',
      { class: 'keigo-answer', id: 'keigo-answer' },
      correct === null ? null : h('p', { class: correct ? 'keigo-right' : 'keigo-wrong', id: 'keigo-verdict' }, correct ? 'Right' : 'Not quite'),
      ...lines,
      h('button', { class: 'primary block', id: 'keigo-next', style: 'margin-top:12px', onclick: onNext }, i + 1 < queue.length ? 'Next' : 'Finish'),
    );
  }

  function show(): void {
    progress.textContent = `${Math.min(i + 1, queue.length)} / ${queue.length}`;
    const item = queue[i];
    if (!item) {
      body.replaceChildren(
        h('p', { class: 'keigo-done', id: 'keigo-done' }, `${right} of ${queue.length} right.`),
        h('p', { class: 'muted small' }, 'Missed ones come back next time.'),
        h('div', { class: 'stack' }, h('button', { class: 'primary block', id: 'keigo-again', onclick: () => refresh() }, 'Another round'), h('button', { class: 'block', onclick: () => go('keigo') }, 'Done')),
      );
      return;
    }
    const note = item.note ? h('p', { class: 'small muted keigo-note', lang: 'ja', 'data-content': '' }, item.note) : null;

    if (item.kind === 'convert') {
      const reveal = h('button', { class: 'primary big', id: 'keigo-reveal' }, 'Show answer');
      const actions = h('div', { class: 'keigo-actions' }, reveal);
      reveal.addEventListener('click', () => {
        actions.replaceChildren(
          h('div', { class: 'keigo-answer', id: 'keigo-answer' }, h('div', { class: 'keigo-big', lang: 'ja', 'data-content': '' }, item.answer), note),
          h(
            'div',
            { class: 'row', style: 'margin-top:12px' },
            h('button', { class: 'grow', id: 'keigo-missed', onclick: () => void record(item, false).then(next) }, 'Missed'),
            h('button', { class: 'primary grow', id: 'keigo-got', onclick: () => void record(item, true).then(next) }, 'Got it'),
          ),
        );
      });
      body.replaceChildren(
        h(
          'div',
          { class: 'card keigo-prompt' },
          h('div', { class: 'muted small', lang: 'ja', 'data-content': '' }, `${item.target}にすると？`),
          h('div', { class: 'keigo-big', lang: 'ja', 'data-content': '' }, item.prompt),
          item.reading && item.reading !== item.prompt ? h('div', { class: 'muted', lang: 'ja', 'data-content': '' }, item.reading) : null,
          item.en ? h('div', { class: 'muted small', 'data-content': '' }, item.en) : null,
        ),
        actions,
      );
      return;
    }

    if (item.kind === 'classify') {
      const choices = h('div', { class: 'keigo-choices' });
      const answer = (pick: string) => {
        const ok = pick === item.answer;
        void record(item, ok);
        choices.replaceChildren(
          feedback(ok, [h('p', { lang: 'ja', 'data-content': '' }, `${item.prompt} ＝ ${item.answer}（${item.plain}）`), note], next),
        );
      };
      choices.append(...(['尊敬語', '謙譲語', '丁寧語'] as const).map((k) => h('button', { class: 'big', dataset: { kind: k }, lang: 'ja', onclick: () => answer(k) }, k)));
      body.replaceChildren(
        h('div', { class: 'card keigo-prompt' }, h('div', { class: 'muted small', lang: 'ja', 'data-content': '' }, 'これは？'), h('div', { class: 'keigo-big', lang: 'ja', 'data-content': '' }, item.prompt)),
        choices,
      );
      return;
    }

    const choices = h('div', { class: 'keigo-choices two' });
    const answer = (pick: boolean) => {
      const ok = pick === item.answer;
      void record(item, ok);
      choices.replaceChildren(feedback(ok, [h('p', { lang: 'ja', 'data-content': '' }, item.answer ? '○ 適切' : '× 不適切'), note], next));
    };
    choices.append(
      h('button', { class: 'big', id: 'keigo-yes', lang: 'ja', onclick: () => answer(true) }, '○ 適切'),
      h('button', { class: 'big', id: 'keigo-no', lang: 'ja', onclick: () => answer(false) }, '× 不適切'),
    );
    body.replaceChildren(
      h('div', { class: 'card keigo-prompt' }, h('div', { class: 'muted small', lang: 'ja', 'data-content': '' }, 'この言い方は適切？'), h('div', { class: 'keigo-sentence', lang: 'ja', 'data-content': '' }, item.prompt)),
      choices,
    );
  }
  show();

  return {
    el: h('div', { class: 'page' }, h('div', { class: 'row spread' }, h('h1', { style: 'margin:0' }, 'Keigo training'), h('a', { href: '#/keigo', class: 'small' }, 'Stop')), progress, body),
  };
}
