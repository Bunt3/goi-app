import { RATINGS, RATING_LABEL, formatInterval, previewRatings, type Rating } from '../srs/fsrs';
import { LEARN_AHEAD_MS, buildQueue, pickNext, type QueueItem } from '../srs/queue';
import type { AnswerUndo } from '../store';
import { stopSpeaking } from '../tts';
import type { Card } from '../types';
import { ensurePersistence, go, store, type View } from './app';
import { cardBack, productionFront, recognitionFront } from './cardview';
import { clear, h, plural } from './dom';

interface Shown {
  item: QueueItem;
  card: Card;
  shownAt: number;
  revealed: boolean;
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export function reviewView(_arg: string, params: URLSearchParams): View {
  const quick = params.get('quick') === '1';
  const s = store.settings;
  const limitMs = quick ? s.quickMinutes * 60_000 : Infinity;
  const limitCards = quick ? s.quickCards : Infinity;

  let startedAt = Date.now();
  let answered = 0;
  let again = 0;
  let remaining = 0;
  let shown: Shown | null = null;
  let lastUndo: (AnswerUndo & { item: QueueItem; wasAgain: boolean }) | null = null;
  let busy = false;
  let finished = false;

  const progress = h('span', { id: 'review-progress' });
  const undoBtn = h('button', { class: 'link', id: 'undo', onclick: () => void undo() }, 'Undo');
  const body = h('div', { class: 'review-body' });
  const actions = h('div', { class: 'review-actions' });
  const el = h(
    'div',
    { class: 'review' },
    h(
      'div',
      { class: 'review-top' },
      h('button', { class: 'icon', 'aria-label': 'Close session', onclick: () => go('home') }, '✕'),
      progress,
      undoBtn,
    ),
    body,
    actions,
  );

  function updateProgress(): void {
    undoBtn.style.visibility = lastUndo && !finished ? 'visible' : 'hidden';
    if (finished) {
      progress.textContent = '';
      return;
    }
    if (quick) {
      const left = limitMs - (Date.now() - startedAt);
      progress.textContent = `${clock(left)} left · ${answered}/${limitCards}`;
    } else {
      progress.textContent = `${answered} done · ${remaining} to go`;
    }
  }

  const ticker = setInterval(updateProgress, 1000);

  async function next(): Promise<void> {
    const now = Date.now();
    await store.refreshToday(now);
    if (quick && (now - startedAt >= limitMs || answered >= limitCards)) return finish('limit', null);
    const queue = buildQueue(store.live(), store.todayLogs, s, now);
    const pick = pickNext(queue, now, shown?.item);
    remaining = queue.main.length + queue.learning.filter((i) => i.due <= now + LEARN_AHEAD_MS).length;
    if (!pick.item) return finish('empty', pick.waitMs);
    const card = store.cards.get(pick.item.cardId);
    if (!card) return finish('empty', null);
    shown = { item: pick.item, card, shownAt: now, revealed: false };
    renderCard();
  }

  function renderCard(): void {
    if (!shown) return;
    const { card, item, revealed } = shown;
    clear(body);
    clear(actions);
    body.dataset.direction = item.direction;
    body.dataset.cardId = card.id;
    if (item.direction === 'recognition') {
      if (!revealed) body.append(...recognitionFront(card));
      else body.append(cardBack(card, s.furigana));
    } else {
      body.append(...productionFront(card));
      if (revealed) body.append(cardBack(card, s.furigana));
    }
    if (!revealed) {
      actions.append(h('button', { class: 'primary big', id: 'reveal', onclick: reveal }, 'Show answer'));
    } else {
      const preview = previewRatings(card.srs[item.direction], Date.now(), s.requestRetention);
      const now = Date.now();
      actions.append(
        h(
          'div',
          { class: 'ratings' },
          RATINGS.map((r) =>
            h(
              'button',
              { class: 'r' + r, dataset: { rating: String(r) }, onclick: () => void rate(r) },
              h('small', null, formatInterval(preview[r].due - now)),
              RATING_LABEL[r],
            ),
          ),
        ),
      );
    }
    body.scrollTop = 0;
    updateProgress();
  }

  function reveal(): void {
    if (!shown || shown.revealed) return;
    shown.revealed = true;
    renderCard();
  }

  async function rate(rating: Rating): Promise<void> {
    if (!shown || !shown.revealed || busy) return;
    busy = true;
    try {
      stopSpeaking();
      const now = Date.now();
      // Cap the recorded time so a card left open over lunch doesn't skew anything.
      const duration = Math.min(now - shown.shownAt, 120_000);
      const undoInfo = await store.answer(shown.card.id, shown.item.direction, rating, now, duration);
      lastUndo = { ...undoInfo, item: shown.item, wasAgain: rating === 1 };
      answered++;
      if (rating === 1) again++;
      void ensurePersistence();
      await next();
    } finally {
      busy = false;
    }
  }

  async function undo(): Promise<void> {
    if (!lastUndo || busy) return;
    busy = true;
    try {
      const u = lastUndo;
      lastUndo = null;
      await store.undo(u);
      answered = Math.max(0, answered - 1);
      if (u.wasAgain) again = Math.max(0, again - 1);
      const card = store.cards.get(u.previous.id);
      if (card) {
        finished = false;
        shown = { item: u.item, card, shownAt: Date.now(), revealed: true };
        renderCard();
      }
    } finally {
      busy = false;
    }
  }

  function finish(reason: 'limit' | 'empty', waitMs: number | null): void {
    finished = true;
    shown = null;
    clear(body);
    clear(actions);
    const elapsed = Date.now() - startedAt;
    let line: string;
    if (answered === 0) {
      line = 'Nothing is due right now.';
    } else {
      const kept = answered - again;
      line =
        `${plural(answered, 'card')} in ${clock(elapsed)} · ${kept} remembered` +
        (again > 0 ? ` · ${again} to see again` : '') +
        '.';
    }
    const now = Date.now();
    const queue = buildQueue(store.live(), store.todayLogs, s, now);
    const more = queue.main.length + queue.learning.filter((i) => i.due <= now + LEARN_AHEAD_MS).length;
    let detail = '';
    if (reason === 'limit' && more > 0) detail = `${plural(more, 'card')} still available today if you want more.`;
    else if (waitMs != null) detail = `Next card comes back in about ${Math.max(1, Math.round(waitMs / 60_000))} min.`;
    else if (answered > 0) detail = 'That’s everything due for now.';

    body.append(
      h(
        'div',
        { class: 'summary' },
        h('div', { class: 'line', id: 'summary-line' }, line),
        detail ? h('div', { class: 'muted' }, detail) : null,
      ),
    );
    actions.append(
      h(
        'div',
        { class: 'stack' },
        reason === 'limit' && more > 0
          ? h(
              'button',
              {
                class: 'block',
                id: 'again-session',
                onclick: () => {
                  startedAt = Date.now();
                  answered = 0;
                  again = 0;
                  lastUndo = null;
                  finished = false;
                  void next();
                },
              },
              'Another quick session',
            )
          : null,
        h('button', { class: 'primary big', id: 'summary-done', onclick: () => go('home') }, 'Done'),
      ),
    );
    updateProgress();
  }

  function onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      go('home');
    } else if (finished) {
      if (e.key === 'Enter') go('home');
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (shown && !shown.revealed) reveal();
      else if (shown?.revealed && e.key === ' ') void rate(3);
    } else if (e.key >= '1' && e.key <= '4') {
      void rate(Number(e.key) as Rating);
    } else if (e.key === 'u' || e.key === 'z') {
      void undo();
    }
  }
  document.addEventListener('keydown', onKey);

  void next();

  return {
    el,
    fullscreen: true,
    destroy: () => {
      clearInterval(ticker);
      document.removeEventListener('keydown', onKey);
      stopSpeaking();
    },
  };
}
