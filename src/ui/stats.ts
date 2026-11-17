import { DAY_MS, startOfDay } from '../day';
import { logsSince } from '../db';
import { forecast } from '../srs/queue';
import { DIRECTIONS, SrsPhase, isInbox, isLeech, type ReviewLog } from '../types';
import { store, type View } from './app';
import { weekSummary } from '../week';
import { h, plural } from './dom';

/** Share of reviews of already-learned cards that were remembered (Hard, Good or Easy). */
export function retention(logs: ReviewLog[]): { total: number; passed: number } {
  const mature = logs.filter((l) => l.stateBefore === SrsPhase.Review && l.rating > 0);
  return { total: mature.length, passed: mature.filter((l) => l.rating >= 2).length };
}

export async function statsView(): Promise<View> {
  const now = Date.now();
  await store.refreshToday(now);
  const live = store.live();
  const s = store.settings;
  const days = forecast(live, store.todayLogs, s, now, 7);
  const peak = Math.max(1, ...days.map((d) => d.shown));
  const recent = await logsSince(startOfDay(now) - 29 * DAY_MS);
  const r = retention(recent);

  const learned = Object.fromEntries(
    DIRECTIONS.map((d) => [d, live.filter((c) => c.srs[d].state === SrsPhase.Review || c.srs[d].state === SrsPhase.Relearning).length]),
  );
  const weekday = new Intl.DateTimeFormat('en', { weekday: 'short' });
  const week = weekSummary(store.cards.values(), recent, now);
  const fromLabel = (g: string) => (g === 'Typed in' || g === 'Dictionary' || g === 'From example sentences' ? g : `“${g}”`);

  const el = h(
    'div',
    { class: 'page' },
    h('h1', null, 'Stats'),
    h('h2', { id: 'week' }, 'Your week'),
    h(
      'div',
      { class: 'card', id: 'week-card' },
      h(
        'dl',
        { class: 'kv' },
        h('dt', null, 'Words you added'),
        h('dd', { id: 'week-added' }, week.added),
        h('dt', null, 'Answers'),
        h('dd', { id: 'week-reviews' }, week.reviews),
        h('dt', null, 'Remembered when reviewed'),
        h('dd', null, week.matureReviews ? `${Math.round((week.remembered / week.matureReviews) * 100)}%` : '—'),
        h('dt', null, 'Moved into long-term review'),
        h('dd', null, week.graduated),
      ),
      week.addedFrom.length
        ? h(
            'div',
            { style: 'margin-top:10px' },
            h('div', { class: 'muted small' }, 'Where new words came from'),
            h(
              'ul',
              { class: 'small', id: 'week-from', style: 'margin:4px 0 0;padding-left:18px' },
              week.addedFrom.map((f) =>
                h('li', null, h('a', { href: `#/browse?filter=all&deck=*&from=${encodeURIComponent(f.group)}`, 'data-content': f.group === 'Typed in' ? null : '' }, fromLabel(f.group)), ` · ${f.count}`),
              ),
            ),
          )
        : null,
      week.slipping.length
        ? h(
            'div',
            { style: 'margin-top:10px' },
            h('div', { class: 'muted small' }, 'Keep slipping (a clearer meaning or example may help more than repetition)'),
            h(
              'div',
              { class: 'chips', id: 'week-slipping', style: 'margin-top:4px' },
              week.slipping.map((x) =>
                h('a', { href: '#/edit/' + encodeURIComponent(x.card.id), class: 'chip linkchip', lang: 'ja', 'data-content': '' }, `${x.card.word} ×${x.again}`),
              ),
            ),
          )
        : null,
      h('p', { class: 'muted small', style: 'margin-top:10px' }, week.reviews === 0 && week.added === 0 ? 'A quiet week. Everything is where you left it.' : `The last 7 study days. ${plural(week.added, 'word')} of your own.`),
    ),
    h('h2', null, 'Reviews due, next 7 days'),
    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'bars', id: 'forecast' },
        days.flatMap((d, i) => [
          h('span', { class: 'muted' }, i === 0 ? 'Today' : weekday.format(new Date(d.day + 12 * 3_600_000))),
          h('div', { class: 'bar' }, h('i', { style: `width:${(d.shown / peak) * 100}%` })),
          h('span', null, d.shown),
        ]),
      ),
      days[0]!.carried > 0
        ? h('p', { class: 'muted small', style: 'margin-top:10px' }, `Capped at ${s.maxReviewsPerDay} a day; anything over rolls to the next day.`)
        : null,
      h('p', { class: 'muted small', style: 'margin-top:10px' }, 'Cards already in review only. New cards you study in the meantime add to this.'),
    ),
    h('h2', null, 'Last 30 days'),
    h(
      'div',
      { class: 'card' },
      h(
        'dl',
        { class: 'kv' },
        h('dt', null, 'Retention'),
        h('dd', { id: 'stat-retention' }, r.total === 0 ? '—' : `${Math.round((r.passed / r.total) * 100)}%`),
        h('dt', null, 'Reviews of learned cards'),
        h('dd', null, r.total),
        h('dt', null, 'All answers'),
        h('dd', null, recent.filter((l) => l.rating > 0).length),
      ),
      h('p', { class: 'muted small', style: 'margin-top:10px' }, `Retention = learned cards recalled when they came up for review. The scheduler aims for ${Math.round(s.requestRetention * 100)}%.`),
    ),
    h('h2', null, 'Deck'),
    h(
      'div',
      { class: 'card' },
      h(
        'dl',
        { class: 'kv' },
        h('dt', null, 'Words learned (recognition)'),
        h('dd', { id: 'stat-learned' }, learned.recognition),
        h('dt', null, 'Words learned (production)'),
        h('dd', null, learned.production),
        h('dt', null, 'Cards in deck'),
        h('dd', null, live.length),
        h('dt', null, 'Not started'),
        h('dd', null, live.filter((c) => !isInbox(c) && c.srs.recognition.state === SrsPhase.New).length),
        h('dt', null, 'Inbox'),
        h('dd', null, live.filter(isInbox).length),
        h('dt', null, 'Leeches'),
        h('dd', null, live.filter(isLeech).length),
      ),
    ),
  );
  return { el };
}
