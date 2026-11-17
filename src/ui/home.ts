import { LEARN_AHEAD_MS, backlogDays, buildQueue } from '../srs/queue';
import { isInbox } from '../types';
import { daysAgoText } from '../util';
import { exportBackup } from './actions';
import { go, refresh, store, type View } from './app';
import { folderNeedsAttention, runAutoBackup } from './autobackup';
import { deckLabel, deckNames } from '../decks';
import { h, plural } from './dom';

export const EXPORT_NUDGE_DAYS = 7;

export async function homeView(): Promise<View> {
  const now = Date.now();
  await store.refreshToday(now);
  const live = store.live();
  const s = store.settings;

  if (live.length === 0) {
    return {
      el: h(
        'div',
        { class: 'page' },
        h('h1', null, 'Goi 語彙'),
        h('p', null, 'No cards yet. Add a word you ran into today, or start from a built-in deck.'),
        h('div', { class: 'stack' },
          h('button', { class: 'primary big', onclick: () => go('add') }, 'Add a word'),
          h('button', { class: 'block', onclick: () => go('more?focus=seed') }, 'Load a starter deck (workplace, slang, onomatopoeia)'),
          h('button', { class: 'block', onclick: () => go('more?focus=import') }, 'Restore from a backup file'),
        ),
      ),
    };
  }

  // Which decks to study. The daily limits are shared across decks.
  const decks = deckNames(live);
  const chosen = store.chosenDecks(live);
  const setDecks = async (next: string[]) => {
    await store.setSettings({ studyDecks: next.length === decks.length ? [] : next });
    refresh();
  };
  const deckChip = (label: string, on: boolean, run: () => void, d?: string) =>
    h('button', { class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), dataset: d === undefined ? { deck: '*' } : { deck: d }, onclick: run }, label);
  const deckBar =
    decks.length > 1
      ? h(
          'div',
          { class: 'chips', id: 'deck-bar', style: 'margin-bottom:12px' },
          deckChip('All decks', chosen.length === 0, () => void setDecks([])),
          decks.map((d) =>
            deckChip(
              `${deckLabel(d)} · ${live.filter((c) => c.deck === d).length}`,
              chosen.includes(d),
              () => void setDecks(chosen.includes(d) ? chosen.filter((x) => x !== d) : [...chosen, d]),
              d,
            ),
          ),
        )
      : null;
  const studying = store.studying();
  const q = buildQueue(studying, store.todayLogs, s, now);
  const learningNow = q.learning.filter((i) => i.due <= now + LEARN_AHEAD_MS).length;
  const learningLater = q.learning.length - learningNow;
  const available = learningNow + q.main.length;
  const inbox = live.filter(isInbox).length;
  const doneToday = store.todayLogs.filter((l) => l.rating !== 0).length;

  const notes: HTMLElement[] = [];
  if (q.counts.deferred > 0) {
    const days = backlogDays(studying, store.todayLogs, s, now);
    notes.push(
      h(
        'div',
        { class: 'notice info' },
        `${plural(q.counts.deferred, 'more review')} ${q.counts.deferred === 1 ? 'is' : 'are'} waiting beyond today’s limit of ${s.maxReviewsPerDay}. ` +
          `They are spread over the next ${plural(days, 'day')}, weakest first.` +
          (q.counts.newPaused ? ' New cards resume once that’s cleared.' : ''),
      ),
    );
  }
  if (inbox > 0) {
    notes.push(
      h(
        'a',
        { class: 'notice info', href: '#/browse?filter=inbox', style: 'display:block;text-decoration:none;color:inherit' },
        `Inbox: ${plural(inbox, 'card')} need${inbox === 1 ? 's' : ''} a reading or meaning before ${inbox === 1 ? 'it' : 'they'} can be studied. `,
        h('span', { style: 'color:var(--accent)' }, 'Open →'),
      ),
    );
  }

  // Folder mode can save without a tap, so catch up on anything left over from last time.
  if (s.autoBackup === 'folder') await runAutoBackup('silent');
  const attention = await folderNeedsAttention();
  // Never exported: the clock starts at the first card, so a brand-new deck isn't nagged on day one.
  const unprotectedSince = store.settings.lastExportAt ?? Math.min(...live.map((c) => c.created));
  const sinceExport = (now - unprotectedSince) / 86_400_000;
  const last = store.settings.lastExportAt;
  const where = store.settings.lastBackupWhere ? ` (${store.settings.lastBackupWhere})` : '';
  const mode = { off: 'Automatic backup is off.', download: 'Backs up to Downloads after you study.', folder: 'Backs up to your chosen folder.' }[s.autoBackup];
  const backupNow = async () => {
    await (s.autoBackup === 'off' ? exportBackup() : runAutoBackup('manual'));
    refresh();
  };
  let exportLine: HTMLElement;
  if (attention !== 'ok') {
    exportLine = h(
      'div',
      { class: 'notice', id: 'backup-attention' },
      h('div', null, attention === 'no-folder' ? 'Automatic backup has no folder to save into.' : 'The backup folder needs permission again before it can be written to.'),
      h('div', { class: 'muted small', style: 'margin:2px 0 8px' }, attention === 'no-folder' ? 'Choose one under More → Backup.' : 'Browsers ask again after a restart unless the app is installed.'),
      attention === 'no-folder'
        ? h('button', { onclick: () => go('more?focus=import') }, 'Open backup settings')
        : h('button', { id: 'backup-allow', onclick: backupNow }, 'Allow and back up now'),
    );
  } else if (sinceExport >= EXPORT_NUDGE_DAYS) {
    exportLine = h(
      'div',
      { class: 'notice' },
      h('div', null, last == null ? 'This deck has never been backed up.' : `Last backed up ${daysAgoText(last, now)}.`),
      h('div', { class: 'muted small', style: 'margin:2px 0 8px' }, 'Browsers can clear site data. A backup file is the only copy outside the browser.'),
      h('button', { id: 'home-export', onclick: backupNow }, 'Back up now'),
    );
  } else {
    exportLine = h(
      'p',
      { class: 'muted small', id: 'export-status' },
      last == null ? 'Not backed up yet. ' : `Last backed up ${daysAgoText(last, now)}${where}. `,
      mode,
    );
  }

  let status: string;
  if (available > 0) status = '';
  else if (learningLater > 0) {
    const mins = Math.max(1, Math.round((q.learning[0]!.due - now) / 60_000));
    status = `Nothing due right now. ${plural(learningLater, 'card')} come${learningLater === 1 ? 's' : ''} back in about ${mins} min.`;
  } else if (doneToday > 0) status = 'Done for today.';
  else status = 'Nothing is due today.';

  return {
    el: h(
      'div',
      { class: 'page' },
      h('h1', null, 'Today'),
      deckBar,
      h(
        'div',
        { class: 'counts' },
        h('div', { class: 'count' }, h('b', { id: 'count-review' }, q.counts.review), h('span', null, 'reviews')),
        h('div', { class: 'count' }, h('b', { id: 'count-new' }, q.counts.new), h('span', null, 'new')),
        h('div', { class: 'count' }, h('b', { id: 'count-learning' }, q.counts.learning), h('span', null, 'learning')),
      ),
      status ? h('p', { id: 'home-status' }, status) : null,
      h(
        'div',
        { class: 'stack', style: 'margin-bottom:16px' },
        h(
          'button',
          { class: 'primary big', id: 'quick-start', disabled: available === 0, onclick: () => go('review?quick=1') },
          `Quick session · ${s.quickMinutes} min or ${plural(s.quickCards, 'card')}`,
        ),
        h(
          'button',
          { class: 'block', id: 'full-start', disabled: available === 0, onclick: () => go('review') },
          available > 0 ? `Everything due now (${available})` : 'Everything due now',
        ),
      ),
      notes,
      q.counts.newWaiting > 0 && !q.counts.newPaused
        ? h('p', { class: 'muted small' }, `${plural(q.counts.newWaiting, 'new card')} queued for later days (${s.maxNewPerDay} per day).`)
        : null,
      doneToday > 0 ? h('p', { class: 'muted small' }, `${plural(doneToday, 'answer')} today.`) : null,
      h(
        'div',
        { class: 'row wrap', style: 'gap:8px;margin:4px 0 12px' },
        h('a', { href: '#/keigo', class: 'chip linkchip', id: 'to-keigo' }, '敬語 Keigo training'),
        h('a', { href: '#/stats', class: 'chip linkchip', id: 'to-week' }, 'Your week'),
      ),
      exportLine,
    ),
  };
}
