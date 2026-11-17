import { ImportError, parseExport } from '../data/export';
import { isNoop, type MergePlan } from '../data/merge';
import { PACKS, packCards, type PackInfo } from '../data/packs/index';
import { SEED_TAG, type ExportFile, type Settings } from '../types';
import { daysAgoText, uuidFromName } from '../util';
import { canShareFiles, exportAnki, exportBackup, shareBackup } from './actions';
import { chooseFolder, folderAccess, folderSupported, forgetFolder, newestBackup, savedFolder } from '../backupfs';
import { applyTheme, ensurePersistence, refresh, store, type View } from './app';
import { runAutoBackup } from './autobackup';
import { deckSection } from './deckpanel';
import { dictSection } from './dictpanel';
import { setUiLang } from './i18n';
import { h, plural, toast } from './dom';

async function loadPack(pack: PackInfo): Promise<{ added: number; skipped: number }> {
  const entries = await pack.load();
  const { fresh, skipped } = await packCards(pack, entries, store.cards, uuidFromName, Date.now());
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

  // ---------------- Automatic backup ----------------
  const autoBox = h('div', { class: 'card', id: 'auto-backup' });

  /** After a folder is picked: offer to import what's already there, otherwise prove the folder works. */
  async function afterFolderChosen(): Promise<void> {
    const folder = await savedFolder();
    if (!folder) return;
    let existing: Awaited<ReturnType<typeof newestBackup>> = null;
    try {
      existing = await newestBackup(folder);
    } catch {
      /* unreadable folder: the write below will report it */
    }
    if (existing) {
      try {
        const file = parseExport(existing.text);
        const plan = await store.planImport(file);
        if (!isNoop(plan.summary)) {
          // Don't write over a folder holding data this device lacks until the user has seen it.
          showPlan(file, plan, `${existing.name} (already in “${folder.name}”)`);
          toast('That folder already has a backup with data this device doesn’t. Review it below.', undefined, 7000);
          return;
        }
      } catch {
        /* not a usable backup: ignore it */
      }
    }
    await runAutoBackup('manual');
  }

  async function renderAuto(): Promise<void> {
    const cur = store.settings;
    const supported = folderSupported();
    const folder = supported ? await savedFolder() : null;
    const access = folder ? await folderAccess(folder, false) : null;

    const mode = h(
      'select',
      { id: 'set-autoBackup', 'aria-label': 'Automatic backup' },
      h('option', { value: 'download', selected: cur.autoBackup === 'download' }, 'Download a file after I study'),
      supported ? h('option', { value: 'folder', selected: cur.autoBackup === 'folder' }, 'Save into a folder I choose') : null,
      h('option', { value: 'off', selected: cur.autoBackup === 'off' }, 'Off (I’ll export by hand)'),
    );
    mode.addEventListener('change', async () => {
      const value = mode.value as 'off' | 'download' | 'folder';
      if (value === 'folder' && !(await savedFolder())) {
        const picked = await chooseFolder().catch(() => null);
        if (!picked) {
          await renderAuto(); // cancelled: stay on the previous mode
          return;
        }
        await store.setSettings({ autoBackup: 'folder' });
        await afterFolderChosen();
      } else {
        await store.setSettings({ autoBackup: value });
      }
      await renderAuto();
      updateLastExport();
    });

    const days = h(
      'select',
      { id: 'set-autoBackupDays', 'aria-label': 'How often' },
      ([1, 3, 7] as const).map((d) =>
        h('option', { value: String(d), selected: cur.autoBackupDays === d }, d === 1 ? 'At most once a day' : d === 3 ? 'At most every 3 days' : 'At most once a week'),
      ),
    );
    days.addEventListener('change', () => void store.setSettings({ autoBackupDays: Number(days.value) }));

    const detail: (HTMLElement | null)[] = [];
    if (cur.autoBackup === 'download') {
      detail.push(
        h('label', { class: 'field', style: 'margin-top:10px' }, h('span', null, 'How often'), days),
        h('p', { class: 'muted small' }, 'When a session ends and there is something new, a file named goi-auto_DATE_LABEL.json is saved to your browser’s download folder. Old files are yours to tidy: a web page can’t delete downloads.'),
      );
    } else if (cur.autoBackup === 'folder') {
      detail.push(
        h(
          'p',
          { style: 'margin-top:10px', id: 'auto-folder' },
          folder ? ['Folder: ', h('b', null, folder.name), access === 'granted' ? '' : ' — permission needed'] : 'No folder chosen yet.',
        ),
        h(
          'div',
          { class: 'row wrap' },
          h(
            'button',
            {
              id: 'choose-folder',
              onclick: async () => {
                try {
                  if (await chooseFolder()) await afterFolderChosen();
                } catch (err) {
                  toast(`Couldn’t use that folder: ${(err as Error).message}`, undefined, 7000);
                }
                await renderAuto();
                updateLastExport();
              },
            },
            folder ? 'Change folder…' : 'Choose folder…',
          ),
          folder && access !== 'granted'
            ? h(
                'button',
                {
                  id: 'allow-folder',
                  onclick: async () => {
                    await runAutoBackup('manual');
                    await renderAuto();
                    updateLastExport();
                  },
                },
                'Allow access',
              )
            : null,
          folder
            ? h(
                'button',
                {
                  class: 'link',
                  onclick: async () => {
                    await forgetFolder();
                    await store.setSettings({ autoBackup: 'download' });
                    await renderAuto();
                  },
                },
                'Stop using it',
              )
            : null,
        ),
        h(
          'p',
          { class: 'muted small', style: 'margin-top:8px' },
          `Saved quietly whenever something changes, one file per day, keeping the newest ${cur.autoBackupKeep}. Pick a folder inside OneDrive, Google Drive or similar and the copies leave this device too — the app itself still never touches the network.`,
        ),
      );
    } else {
      detail.push(h('p', { class: 'muted small', style: 'margin-top:10px' }, 'Nothing is saved outside the browser unless you export. The Today screen reminds you after 7 days.'));
    }
    if (!supported) {
      detail.push(
        h('p', { class: 'muted small', id: 'folder-unsupported' }, 'Saving straight into a folder isn’t available in this browser: Firefox doesn’t support it and Brave turns it off. Chrome and Edge do.'),
      );
    }

    if (cur.autoBackup !== 'off') {
      detail.push(
        h(
            'button',
            {
              class: 'block',
              id: 'backup-now',
              style: 'margin-top:4px',
              onclick: async () => {
                await runAutoBackup('manual');
                await renderAuto();
                updateLastExport();
              },
            },
            'Back up now',
        ),
      );
    }
    autoBox.replaceChildren(
      h('label', { class: 'field', style: 'margin-bottom:0' }, h('span', null, 'Automatic backup'), mode),
      ...detail.filter((x): x is HTMLElement => x !== null),
    );
  }
  void renderAuto();

  const lastExport = h('p', { id: 'last-export' });
  function updateLastExport(): void {
    const cur = store.settings;
    lastExport.textContent =
      liveCount === 0 && cur.lastExportAt == null
        ? 'Nothing to back up yet.'
        : `Last backed up ${daysAgoText(cur.lastExportAt, Date.now())}${cur.lastBackupWhere ? ` (${cur.lastBackupWhere})` : ''}.`;
  }
  updateLastExport();

  const deviceLabel = h('input', { type: 'text', id: 'set-deviceLabel', value: s.deviceLabel, placeholder: 'e.g. phone or desktop', autocomplete: 'off', autocapitalize: 'off' });
  deviceLabel.addEventListener('change', () => void store.setSettings({ deviceLabel: deviceLabel.value.trim() }));

  const backup = h(
    'section',
    { id: 'sec-backup' },
    h('h2', null, 'Backup & transfer'),
    lastExport,
    h('label', { class: 'field' }, h('span', null, 'Device label (goes in the backup filename)'), deviceLabel),
    autoBox,
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
        'Export backup now (JSON)',
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

  const uiLangSelect = h(
    'select',
    { id: 'set-uiLang', 'data-content': '' },
    h('option', { value: 'en', selected: s.uiLang !== 'ja' }, 'English'),
    h('option', { value: 'ja', selected: s.uiLang === 'ja' }, '日本語'),
  );
  uiLangSelect.addEventListener('change', async () => {
    const next = uiLangSelect.value === 'ja' ? 'ja' : 'en';
    await store.setSettings({ uiLang: next });
    setUiLang(next);
    refresh();
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
    h(
      'label',
      { class: 'field' },
      h('span', null, 'Interface language'),
      uiLangSelect,
      h('span', { class: 'small', style: 'margin-top:4px' }, 'Menus, buttons and messages. Your cards and the dictionary stay as they are.'),
    ),
  );

  // ---------------- Starter decks & tools ----------------
  const packRows = PACKS.map((pack) => {
    const result = h('p', { class: 'small', id: pack.id === 'workplace' ? 'seed-result' : `pack-result-${pack.id}` });
    const btn = h(
      'button',
      {
        class: 'block',
        id: pack.id === 'workplace' ? 'load-seed' : `load-pack-${pack.id}`,
        onclick: async () => {
          btn.disabled = true;
          try {
            const r = await loadPack(pack);
            void ensurePersistence();
            result.textContent =
              r.added > 0
                ? `Added ${plural(r.added, 'card')} to ${pack.deck}${r.skipped ? ` (${r.skipped} were already here or previously deleted)` : ''}. They enter study at your new-card limit.`
                : `${pack.title} is already loaded. Nothing was added.`;
          } catch {
            // The deck is a separate file; an app update in the background can leave this copy pointing at a stale one.
            result.textContent = 'Could not load this deck. Reload the app and try again.';
          } finally {
            btn.disabled = false;
          }
        },
      },
      `Load ${pack.title}`,
    );
    return h('div', { class: 'card', style: 'margin-bottom:10px' }, h('b', null, pack.title), h('p', { class: 'small', style: 'margin:4px 0 8px' }, pack.blurb), btn, result);
  });
  const tools = h(
    'section',
    { id: 'sec-seed' },
    h('h2', null, 'Starter decks'),
    h(
      'p',
      { class: 'small' },
      'Each loads into its own deck; choose which decks to study on the Today screen. ',
      h('b', null, 'They were machine-written and have not been checked by a native speaker'),
      `, so every card carries the ${SEED_TAG} tag. Treat readings and nuance as provisional until you verify them. Where a slang term was found in a published ranking or explainer, the card’s Source says where.`,
    ),
    packRows,
    h('h2', null, 'More'),
    h('div', { class: 'stack' }, h('a', { href: '#/stats' }, 'Stats'), h('a', { href: '#/capture' }, 'Capture from a photo, screenshot or text'), h('a', { href: '#/bulk' }, 'Paste many cards (TSV / CSV)'), h('a', { href: '#/browse?filter=leech' }, 'Leeches to rewrite')),
    h('p', { class: 'muted small', style: 'margin-top:24px' }, `Goi ${__APP_VERSION__} · everything stays on this device · no requests to other sites.`),
  );

  const dict = dictSection();
  const decks = deckSection();
  const el = h('div', { class: 'page' }, h('h1', null, 'More'), backup, settings, decks, dict.el, tools);

  const focus = params.get('focus');
  if (focus) {
    setTimeout(() => {
      const target = focus === 'seed' ? tools : focus === 'import' ? backup : focus === 'dict' ? dict.el : focus === 'decks' ? decks : null;
      target?.scrollIntoView({ block: 'start' });
    }, 30);
  }
  return { el, destroy: dict.destroy };
}
