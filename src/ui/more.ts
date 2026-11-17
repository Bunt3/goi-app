import { createCard } from '../cards';
import { ImportError, parseExport } from '../data/export';
import { isNoop, type MergePlan } from '../data/merge';
import { SEED_TAG, type Card, type ExportFile, type Settings } from '../types';
import { daysAgoText, uuidFromName } from '../util';
import { canShareFiles, exportAnki, exportBackup, shareBackup } from './actions';
import { applyTheme, ensurePersistence, refresh, store, type View } from './app';
import { h, plural, toast } from './dom';

async function loadSeedDeck(): Promise<{ added: number; skipped: number }> {
  const { SEED } = await import('../data/seed');
  const now = Date.now();
  const fresh: Card[] = [];
  let skipped = 0;
  for (const [i, entry] of SEED.entries()) {
    // Deterministic ids: loading the seed on two devices yields the same cards, so they merge instead of duplicating.
    const id = await uuidFromName(`seed:${entry.word}:${entry.reading}`);
    if (store.cards.has(id)) {
      skipped++; // already loaded, or loaded and deliberately deleted
      continue;
    }
    fresh.push(createCard({ ...entry, tags: [...entry.tags, SEED_TAG], source: 'seed deck' }, now + i, id));
  }
  await store.addCards(fresh);
  return { added: fresh.length, skipped };
}

function numberSetting(
  label: string,
  key: 'maxReviewsPerDay' | 'maxNewPerDay' | 'quickMinutes' | 'quickCards',
  min: number,
  max: number,
  hint?: string,
): HTMLElement {
  const input = h('input', { type: 'number', id: 'set-' + key, inputMode: 'numeric', min: String(min), max: String(max), value: String(store.settings[key]) });
  input.addEventListener('change', () => {
    const n = Math.round(Number(input.value));
    const value = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : store.settings[key];
    input.value = String(value);
    void store.setSettings({ [key]: value } as Partial<Settings>);
  });
  return h('label', { class: 'field' }, h('span', null, label), input, hint ? h('span', { class: 'small', style: 'margin-top:4px' }, hint) : null);
}

export function moreView(_arg: string, params: URLSearchParams): View {
  const s = store.settings;
  const now = Date.now();
  const liveCount = store.live().length;

  // ---------------- Backup & import ----------------
  const importStage = h('div', { id: 'import-stage' });
  const fileInput = h('input', { type: 'file', id: 'import-file', accept: '.json,application/json', style: 'display:none' });

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const file = parseExport(await f.text());
      const plan = await store.planImport(file);
      showPlan(file, plan, f.name);
    } catch (err) {
      importStage.replaceChildren(
        h(
          'div',
          { class: 'notice danger', id: 'import-error' },
          h('b', null, 'Could not read that file. '),
          err instanceof ImportError ? err.message : String(err),
          h('div', { class: 'muted small' }, 'Nothing on this device was changed.'),
        ),
      );
    }
  });

  function showPlan(file: ExportFile, plan: MergePlan, name: string): void {
    const m = plan.summary;
    const noop = isNoop(m);
    const fileCards = file.cards.filter((c) => !c.deleted).length;
    const row = (label: string, value: number, id?: string) => [h('dt', null, label), h('dd', id ? { id } : null, value)];
    const confirmBox = h('div');

    const askReplace = () => {
      confirmBox.replaceChildren(
        h(
          'div',
          { class: 'notice danger' },
          h(
            'p',
            null,
            `This erases the ${plural(liveCount, 'card')} and all review history on this device, then loads the ${plural(fileCards, 'card')} and ${plural(file.reviewLogs.length, 'review')} from the file. It can’t be undone.`,
          ),
          liveCount > 0 ? h('p', { class: 'small' }, 'If anything here isn’t in that file, cancel and use Merge, or export a backup of this device first.') : null,
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              {
                class: 'danger solid',
                id: 'confirm-replace',
                onclick: async () => {
                  await store.replaceWith(file);
                  applyTheme();
                  void ensurePersistence();
                  toast(`Replaced with ${plural(fileCards, 'card')} from the file.`);
                  refresh();
                },
              },
              'Erase and replace',
            ),
            h('button', { onclick: () => confirmBox.replaceChildren() }, 'Cancel'),
          ),
        ),
      );
    };

    importStage.replaceChildren(
      h(
        'div',
        { class: 'card', id: 'import-summary' },
        h('p', null, h('b', null, name)),
        h(
          'p',
          { class: 'muted small' },
          `From “${file.deviceLabel || 'unlabelled device'}”, exported ${file.exportedAt ? new Date(file.exportedAt).toLocaleString() : 'at an unknown time'} · ${plural(fileCards, 'card')}, ${plural(file.reviewLogs.length, 'review')}.`,
        ),
        h('p', null, noop ? 'Merging would change nothing: this device already has everything in the file.' : 'Merging would make these changes:'),
        h(
          'dl',
          { class: 'kv small' },
          row('Cards added', m.cardsAdded, 'sum-added'),
          row('Cards updated (newer edit in file)', m.cardsUpdatedFromFile, 'sum-updated'),
          row('Cards kept (newer edit here)', m.cardsKeptLocal, 'sum-kept'),
          row('Cards deleted (deleted on other device)', m.cardsDeleted),
          row('Cards only on this device (untouched)', m.cardsOnlyLocal),
          row('Reviews added', m.logsAdded, 'sum-logs'),
          row('Reviews already here (skipped)', m.logsDuplicate),
          row('Progress taken from file', m.progressFromFile),
          row('Progress combined from both devices', m.progressReplayed),
        ),
        m.details.length
          ? h('details', { style: 'margin-top:10px' }, h('summary', null, 'Examples'), h('ul', { class: 'small', lang: 'ja' }, m.details.map((d) => h('li', null, d))))
          : null,
        h(
          'div',
          { class: 'stack', style: 'margin-top:12px' },
          h(
            'button',
            {
              class: 'primary block',
              id: 'confirm-merge',
              disabled: noop,
              onclick: async () => {
                await store.applyMerge(plan);
                void ensurePersistence();
                toast(`Merged: ${plural(m.cardsAdded, 'card')} added, ${m.cardsUpdatedFromFile} updated, ${plural(m.logsAdded, 'review')} added.`);
                refresh();
              },
            },
            noop ? 'Nothing to merge' : 'Merge into this device',
          ),
          h('div', { class: 'row' }, h('button', { class: 'danger grow', id: 'ask-replace', onclick: askReplace }, 'Replace everything…'), h('button', { class: 'grow', onclick: () => importStage.replaceChildren() }, 'Cancel')),
        ),
        confirmBox,
      ),
    );
    importStage.scrollIntoView({ block: 'nearest' });
  }

  const persistLine = h('p', { class: 'muted small', id: 'persist-status' }, 'Checking storage protection…');
  const persistBtn = h('button', { style: 'display:none', onclick: () => void requestPersist() }, 'Ask the browser to protect this data');
  async function describePersistence(): Promise<void> {
    if (!navigator.storage?.persisted) {
      persistLine.textContent = 'This browser can’t report whether it protects site data. Rely on exports.';
      return;
    }
    const ok = await navigator.storage.persisted();
    let usage = '';
    try {
      const est = await navigator.storage.estimate();
      if (est.usage != null) usage = ` Using about ${(est.usage / 1024 / 1024).toFixed(1)} MB.`;
    } catch {
      /* optional */
    }
    persistLine.textContent = ok
      ? `Storage is marked persistent: the browser won’t clear it automatically.${usage} Clearing site data by hand still erases it.`
      : `Storage is not protected: the browser may clear it if the device runs low on space.${usage}`;
    persistBtn.style.display = ok ? 'none' : '';
  }
  async function requestPersist(): Promise<void> {
    const ok = (await navigator.storage?.persist?.()) ?? false;
    if (!ok) toast('The browser declined. Installing the app (or bookmarking it) usually changes that.', undefined, 6000);
    await describePersistence();
  }
  void describePersistence();

  const deviceLabel = h('input', { type: 'text', id: 'set-deviceLabel', value: s.deviceLabel, placeholder: 'e.g. s24 or desktop', autocomplete: 'off', autocapitalize: 'off' });
  deviceLabel.addEventListener('change', () => void store.setSettings({ deviceLabel: deviceLabel.value.trim() }));

  const backup = h(
    'section',
    { id: 'sec-backup' },
    h('h2', null, 'Backup & transfer'),
    h('p', { id: 'last-export' }, liveCount === 0 && s.lastExportAt == null ? 'Nothing to back up yet.' : `Last exported ${daysAgoText(s.lastExportAt, now)}.`),
    h('label', { class: 'field' }, h('span', null, 'Device label (goes in the backup filename)'), deviceLabel),
    h(
      'div',
      { class: 'stack' },
      h(
        'button',
        {
          class: 'primary block',
          id: 'export-json',
          onclick: async () => {
            await exportBackup();
            refresh();
          },
        },
        'Export backup (JSON)',
      ),
      canShareFiles()
        ? h(
            'button',
            {
              class: 'block',
              id: 'share-json',
              onclick: async () => {
                await shareBackup();
                refresh();
              },
            },
            'Share backup…',
          )
        : null,
      h('button', { class: 'block', id: 'export-anki', onclick: exportAnki }, 'Export for Anki (TSV)'),
      h('button', { class: 'block', id: 'import-open', onclick: () => fileInput.click() }, 'Import a backup…'),
      fileInput,
    ),
    h('p', { class: 'muted small', style: 'margin-top:8px' }, 'Import shows what would change before anything is written.'),
    importStage,
    persistLine,
    persistBtn,
  );

  // ---------------- Settings ----------------
  const retentionLabel = h('span', null, `Target retention ${Math.round(s.requestRetention * 100)}%`);
  const retention = h('input', { type: 'range', id: 'set-retention', min: '0.8', max: '0.95', step: '0.01', value: String(s.requestRetention) });
  retention.addEventListener('input', () => {
    retentionLabel.textContent = `Target retention ${Math.round(Number(retention.value) * 100)}%`;
  });
  retention.addEventListener('change', () => void store.setSettings({ requestRetention: Number(retention.value) }));

  const toggle = (label: string, key: 'pauseNewDuringBacklog' | 'furigana', id: string, after?: () => void) =>
    h(
      'label',
      { class: 'check' },
      h('input', {
        type: 'checkbox',
        id,
        checked: store.settings[key],
        onchange: (e: Event) => {
          void store.setSettings({ [key]: (e.target as HTMLInputElement).checked } as Partial<Settings>);
          after?.();
        },
      }),
      label,
    );

  const theme = h(
    'select',
    { id: 'set-theme' },
    h('option', { value: 'dark', selected: s.theme === 'dark' }, 'Dark'),
    h('option', { value: 'light', selected: s.theme === 'light' }, 'Light'),
  );
  theme.addEventListener('change', async () => {
    await store.setSettings({ theme: theme.value as 'dark' | 'light' });
    applyTheme();
  });

  const settings = h(
    'section',
    { id: 'sec-settings' },
    h('h2', null, 'Daily limits'),
    numberSetting('Reviews per day', 'maxReviewsPerDay', 1, 999, 'Anything over this waits for the following days, weakest first.'),
    numberSetting('New cards per day', 'maxNewPerDay', 0, 999, 'Each direction counts: a word’s production side is a new card on a later day.'),
    toggle('Hold new cards while reviews exceed the daily limit', 'pauseNewDuringBacklog', 'set-pauseNew'),
    h('h2', null, 'Quick session'),
    h('div', { class: 'row' }, h('div', { class: 'grow' }, numberSetting('Minutes', 'quickMinutes', 1, 60)), h('div', { class: 'grow' }, numberSetting('Cards', 'quickCards', 1, 200))),
    h('p', { class: 'muted small' }, 'A quick session ends at whichever comes first.'),
    h('h2', null, 'Scheduling'),
    h('label', { class: 'field' }, retentionLabel, retention, h('span', { class: 'small', style: 'margin-top:4px' }, 'Higher means shorter intervals and more reviews. 90% is the usual balance. Applies to future reviews.')),
    h('h2', null, 'Display'),
    toggle('Furigana on the target word (answer side)', 'furigana', 'set-furigana'),
    h('label', { class: 'field', style: 'margin-top:8px' }, h('span', null, 'Theme'), theme),
  );

  // ---------------- Seed deck & tools ----------------
  const seedResult = h('p', { class: 'small', id: 'seed-result' });
  const seedBtn = h(
    'button',
    {
      class: 'block',
      id: 'load-seed',
      onclick: async () => {
        seedBtn.disabled = true;
        const r = await loadSeedDeck();
        void ensurePersistence();
        seedResult.textContent =
          r.added > 0
            ? `Added ${plural(r.added, 'card')}${r.skipped ? ` (${r.skipped} were already loaded or previously deleted)` : ''}. They enter study at your new-card limit.`
            : 'The seed deck is already loaded. Nothing was added.';
        seedBtn.disabled = false;
      },
    },
    'Load seed deck',
  );
  const tools = h(
    'section',
    { id: 'sec-seed' },
    h('h2', null, 'Seed deck'),
    h(
      'p',
      { class: 'small' },
      'About 180 workplace words and set phrases (phone, email, meetings, HR and contracts, customer and IT support). ',
      h('b', null, 'They were machine-written and have not been checked by a native speaker'),
      `, so every card carries the ${SEED_TAG} tag. Treat readings and nuance as provisional until you verify them.`,
    ),
    seedBtn,
    seedResult,
    h('h2', null, 'More'),
    h('div', { class: 'stack' }, h('a', { href: '#/stats' }, 'Stats'), h('a', { href: '#/bulk' }, 'Paste many cards (TSV / CSV)'), h('a', { href: '#/browse?filter=leech' }, 'Leeches to rewrite')),
    h('p', { class: 'muted small', style: 'margin-top:24px' }, `Goi ${__APP_VERSION__} · everything stays on this device · no network calls after install.`),
  );

  const el = h('div', { class: 'page' }, h('h1', null, 'More'), backup, settings, tools);

  const focus = params.get('focus');
  if (focus) {
    setTimeout(() => {
      const target = focus === 'seed' ? tools : focus === 'import' ? backup : null;
      target?.scrollIntoView({ block: 'start' });
    }, 30);
  }
  return { el };
}
