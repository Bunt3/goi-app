import { migrateDeck } from '../decks';
import { isoDate } from '../day';
import { newSrs } from '../srs/fsrs';
import {
  APP_ID,
  DEFAULT_SETTINGS,
  DIRECTIONS,
  REGISTERS,
  SCHEMA_VERSION,
  type Card,
  type ExportFile,
  type Register,
  type ReviewLog,
  type Settings,
  type SrsState,
} from '../types';

export function buildExport(cards: Card[], logs: ReviewLog[], settings: Settings, now: number): ExportFile {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    deviceLabel: settings.deviceLabel,
    cards: [...cards].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id)),
    reviewLogs: [...logs].sort((a, b) => a.reviewedAt - b.reviewedAt || a.id.localeCompare(b.id)),
    settings,
  };
}

export function serializeExport(file: ExportFile): string {
  return JSON.stringify(file, null, 1);
}

/** Device label reduced to something safe in a filename on Windows and Android. */
export function fileLabel(deviceLabel: string): string {
  const cleaned = deviceLabel
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'device';
}

export function exportFilename(kind: 'backup' | 'auto' | 'anki', deviceLabel: string, now: number): string {
  const ext = kind === 'anki' ? 'tsv' : 'json';
  return `goi-${kind}_${isoDate(now)}_${fileLabel(deviceLabel)}.${ext}`;
}

export class ImportError extends Error {}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function parseSrs(v: unknown, created: number): SrsState {
  const base = newSrs(created);
  if (!v || typeof v !== 'object') return base;
  const o = v as Record<string, unknown>;
  const state = num(o.state, 0);
  return {
    due: num(o.due, base.due),
    stability: num(o.stability, 0),
    difficulty: num(o.difficulty, 0),
    elapsed_days: num(o.elapsed_days, 0),
    scheduled_days: num(o.scheduled_days, 0),
    learning_steps: num(o.learning_steps, 0),
    reps: num(o.reps, 0),
    lapses: num(o.lapses, 0),
    state: (state >= 0 && state <= 3 ? state : 0) as SrsState['state'],
    last_review: typeof o.last_review === 'number' ? o.last_review : null,
  };
}

function parseCard(v: unknown, index: number): Card {
  if (!v || typeof v !== 'object') throw new ImportError(`Card #${index + 1} is not an object.`);
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) throw new ImportError(`Card #${index + 1} has no id.`);
  const created = num(o.created, Date.now());
  const srs = (o.srs ?? {}) as Record<string, unknown>;
  const register = REGISTERS.includes(o.register as Register) ? (o.register as Register) : null;
  return {
    id: o.id,
    word: str(o.word),
    reading: str(o.reading),
    meaning_en: str(o.meaning_en),
    meaning_ja: str(o.meaning_ja),
    example_ja: str(o.example_ja),
    example_en: str(o.example_en),
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
    deck: migrateDeck(o.deck, str(o.source)),
    register,
    source: str(o.source),
    created,
    updated: num(o.updated, created),
    deleted: o.deleted === true,
    srs: { recognition: parseSrs(srs.recognition, created), production: parseSrs(srs.production, created) },
    productionUnlockedAt: typeof o.productionUnlockedAt === 'number' ? o.productionUnlockedAt : null,
  };
}

function parseLog(v: unknown, index: number): ReviewLog {
  if (!v || typeof v !== 'object') throw new ImportError(`Review log #${index + 1} is not an object.`);
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.cardId !== 'string' || typeof o.reviewedAt !== 'number') {
    throw new ImportError(`Review log #${index + 1} is missing id, cardId or reviewedAt.`);
  }
  if (!DIRECTIONS.includes(o.direction as never)) throw new ImportError(`Review log #${index + 1} has a bad direction.`);
  const rating = num(o.rating, -1);
  if (![0, 1, 2, 3, 4].includes(rating)) throw new ImportError(`Review log #${index + 1} has a bad rating.`);
  const phase = (x: unknown) => {
    const n = num(x, 0);
    return (n >= 0 && n <= 3 ? n : 0) as ReviewLog['stateBefore'];
  };
  return {
    id: o.id,
    cardId: o.cardId,
    direction: o.direction as ReviewLog['direction'],
    rating: rating as ReviewLog['rating'],
    reviewedAt: o.reviewedAt,
    stateBefore: phase(o.stateBefore),
    stateAfter: phase(o.stateAfter),
    elapsedDays: num(o.elapsedDays, 0),
    scheduledDays: num(o.scheduledDays, 0),
    durationMs: num(o.durationMs, 0),
  };
}

export function parseSettings(v: unknown): Settings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const clampInt = (x: unknown, fallback: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round(num(x, fallback))));
  return {
    deviceLabel: str(o.deviceLabel),
    maxReviewsPerDay: clampInt(o.maxReviewsPerDay, d.maxReviewsPerDay, 1, 9999),
    maxNewPerDay: clampInt(o.maxNewPerDay, d.maxNewPerDay, 0, 9999),
    pauseNewDuringBacklog: typeof o.pauseNewDuringBacklog === 'boolean' ? o.pauseNewDuringBacklog : d.pauseNewDuringBacklog,
    quickMinutes: clampInt(o.quickMinutes, d.quickMinutes, 1, 120),
    quickCards: clampInt(o.quickCards, d.quickCards, 1, 999),
    requestRetention: Math.min(0.97, Math.max(0.7, num(o.requestRetention, d.requestRetention))),
    furigana: typeof o.furigana === 'boolean' ? o.furigana : d.furigana,
    ttsVoiceURI: typeof o.ttsVoiceURI === 'string' ? o.ttsVoiceURI : null,
    ttsRate: Math.min(2, Math.max(0.5, num(o.ttsRate, d.ttsRate))),
    listenSource: o.listenSource === 'word' ? 'word' : 'example',
    theme: o.theme === 'light' ? 'light' : 'dark',
    lastExportAt: typeof o.lastExportAt === 'number' ? o.lastExportAt : null,
    autoBackup: o.autoBackup === 'off' || o.autoBackup === 'folder' ? o.autoBackup : d.autoBackup,
    autoBackupDays: clampInt(o.autoBackupDays, d.autoBackupDays, 1, 30),
    autoBackupKeep: clampInt(o.autoBackupKeep, d.autoBackupKeep, 1, 365),
    lastBackupMark: str(o.lastBackupMark),
    lastBackupWhere: str(o.lastBackupWhere),
    uiLang: o.uiLang === 'ja' ? 'ja' : 'en',
    studyDecks: Array.isArray(o.studyDecks) ? o.studyDecks.filter((t): t is string => typeof t === 'string') : [],
  };
}

/** Parse and validate a backup file. Throws ImportError with a plain-language message. */
export function parseExport(text: string): ExportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('This file is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new ImportError('This file is not a Goi backup.');
  const o = raw as Record<string, unknown>;
  if (o.app !== APP_ID) throw new ImportError('This file is not a Goi backup (missing "app": "goi-app").');
  const version = num(o.schemaVersion, NaN);
  if (!Number.isInteger(version) || version < 1) throw new ImportError('This backup has no valid schemaVersion.');
  if (version > SCHEMA_VERSION) {
    throw new ImportError(
      `This backup uses schema version ${version}, but this copy of the app only understands up to ${SCHEMA_VERSION}. Update the app on this device first.`,
    );
  }
  if (!Array.isArray(o.cards) || !Array.isArray(o.reviewLogs)) {
    throw new ImportError('This backup is missing its cards or reviewLogs list.');
  }
  return {
    app: APP_ID,
    schemaVersion: version,
    exportedAt: num(o.exportedAt, 0),
    deviceLabel: str(o.deviceLabel),
    cards: o.cards.map(parseCard),
    reviewLogs: o.reviewLogs.map(parseLog),
    settings: parseSettings(o.settings),
  };
}
