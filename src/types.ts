export type Direction = 'recognition' | 'production';
export const DIRECTIONS: Direction[] = ['recognition', 'production'];

export const REGISTERS = ['casual', 'polite', '尊敬語', '謙譲語', 'written-only'] as const;
export type Register = (typeof REGISTERS)[number];

export const DEFAULT_TAGS = ['電話応対', 'メール', '会議', '人事・契約', 'IT', '接客', '日常'] as const;
export const SEED_TAG = 'seed-unverified';
/** Given to cards whose reading or meaning came from the offline dictionary, so they can be found and checked. */
export const AUTO_TAG = 'auto-filled';

/** FSRS states, numerically identical to ts-fsrs `State`. */
export const SrsPhase = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const;

/** ts-fsrs card state with dates stored as epoch milliseconds. */
export interface SrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  last_review: number | null;
}

export interface Card {
  /** UUID. Identity for merge. */
  id: string;
  word: string;
  /** Kana reading. */
  reading: string;
  meaning_en: string;
  /** Optional short Japanese definition. */
  meaning_ja: string;
  example_ja: string;
  example_en: string;
  tags: string[];
  register: Register | null;
  /** Free text: where the word was seen. */
  source: string;
  /** Epoch ms. */
  created: number;
  /** Epoch ms. Bumped by content edits and deletion only — never by reviews. */
  updated: number;
  /** Tombstone, kept so a deletion survives merging with another device. */
  deleted: boolean;
  /** One independent FSRS state per review direction. */
  srs: Record<Direction, SrsState>;
  /** Epoch ms of the first successful recognition review; production is locked while null. */
  productionUnlockedAt: number | null;
}

export interface ReviewLog {
  /** UUID. Primary dedupe key for merge. */
  id: string;
  cardId: string;
  direction: Direction;
  /** 1 Again, 2 Hard, 3 Good, 4 Easy. 0 = manual progress reset. */
  rating: 0 | 1 | 2 | 3 | 4;
  /** Epoch ms. */
  reviewedAt: number;
  stateBefore: 0 | 1 | 2 | 3;
  stateAfter: 0 | 1 | 2 | 3;
  /** Days since the previous review of this direction. */
  elapsedDays: number;
  /** Interval assigned by this review, in days (0 for same-day learning steps). */
  scheduledDays: number;
  /** Time spent on the card, ms (0 if unknown). */
  durationMs: number;
}

export interface Settings {
  deviceLabel: string;
  maxReviewsPerDay: number;
  maxNewPerDay: number;
  /** Skip new cards on days when due reviews exceed the review cap. */
  pauseNewDuringBacklog: boolean;
  quickMinutes: number;
  quickCards: number;
  /** FSRS desired retention, 0.70–0.97. */
  requestRetention: number;
  furigana: boolean;
  ttsVoiceURI: string | null;
  ttsRate: number;
  listenSource: 'example' | 'word';
  theme: 'dark' | 'light';
  /** Epoch ms of the last backup of any kind (manual export or automatic) on this device. */
  lastExportAt: number | null;
  /**
   * Automatic backup. 'download' saves a file to the browser's download
   * folder after a study session; 'folder' writes into a folder chosen once
   * (File System Access API, Chromium only); 'off' leaves it to manual export.
   */
  autoBackup: 'off' | 'download' | 'folder';
  /** Download mode: minimum study days between automatic downloads. */
  autoBackupDays: number;
  /** Folder mode: how many daily files to keep before the oldest is removed. */
  autoBackupKeep: number;
  /** Fingerprint of the deck at the last backup; a different one means there is unsaved work. */
  lastBackupMark: string;
  /** Where the last backup went, for display ("Downloads", a folder name, "manual export"). */
  lastBackupWhere: string;
}

export const DEFAULT_SETTINGS: Settings = {
  deviceLabel: '',
  maxReviewsPerDay: 40,
  maxNewPerDay: 8,
  pauseNewDuringBacklog: true,
  quickMinutes: 5,
  quickCards: 20,
  requestRetention: 0.9,
  furigana: true,
  ttsVoiceURI: null,
  ttsRate: 1,
  listenSource: 'example',
  theme: 'dark',
  lastExportAt: null,
  autoBackup: 'download',
  autoBackupDays: 1,
  autoBackupKeep: 14,
  lastBackupMark: '',
  lastBackupWhere: '',
};

export const SCHEMA_VERSION = 1;
export const APP_ID = 'goi-app';

export interface ExportFile {
  app: typeof APP_ID;
  schemaVersion: number;
  /** Epoch ms. */
  exportedAt: number;
  deviceLabel: string;
  cards: Card[];
  reviewLogs: ReviewLog[];
  settings: Settings;
}

/** A card with no reading or no English meaning can't be reviewed yet. */
export function isInbox(card: Pick<Card, 'reading' | 'meaning_en'>): boolean {
  return card.reading.trim() === '' || card.meaning_en.trim() === '';
}

export const LEECH_LAPSES = 8;

export function isLeech(card: Pick<Card, 'srs'>): boolean {
  return card.srs.recognition.lapses >= LEECH_LAPSES || card.srs.production.lapses >= LEECH_LAPSES;
}
