import type { DictEntry } from '../src/dict/entry';

export function compactWord(word: unknown, maxExamples?: number): DictEntry;
export function buildDict(json: unknown, maxExamples?: number): { entries: number; examples: number; text: string };
