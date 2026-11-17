/**
 * Deinflection: from a conjugated form to the dictionary forms it could
 * come from (承りました → 承る, 高くなかった → 高い, 食べちゃった → 食べる).
 *
 * Each rule replaces a suffix. Rules carry two word classes: the class the
 * inflected form behaves as (so it can be peeled further — 〜ない conjugates
 * like an i-adjective, 〜ている like an ichidan verb) and the class of the
 * result. Rules chain until nothing applies. A candidate is only a guess
 * until a dictionary entry with a matching part of speech confirms it.
 *
 * The table is written for this app from standard conjugation patterns.
 * Pure: no DOM, no storage.
 */

/** Word classes, as bit flags. */
export const W = {
  /** The text as given, before any rule: anything may apply. */
  ANY: 1,
  V1: 2, // ichidan verb, dictionary form
  V5: 4, // godan verb, dictionary form
  VS: 8, // する verb, dictionary form
  VK: 16, // 来る, dictionary form
  ADJ: 32, // i-adjective, dictionary form (also 〜ない, 〜たい)
  MASU: 64, // 〜ます
  TE: 128, // te-form
  PAST: 256, // 〜た
  VSN: 512, // noun that takes する
} as const;

/** Classes a dictionary entry can have. */
export const DICT_CLASSES = W.V1 | W.V5 | W.VS | W.VK | W.ADJ | W.VSN;
const ALL = 0x3ff;

export interface Rule {
  from: string;
  to: string;
  /** Classes the inflected form may have for the rule to apply. */
  in: number;
  /** Class of the result. */
  out: number;
  why: string;
}

export interface Candidate {
  term: string;
  /** Class of the term; W.ANY for the text as given. */
  cls: number;
  /** Rule names applied, the one nearest the dictionary form first ("polite", "past"). */
  reasons: string[];
}

const { ANY, V1, V5, VS, VK, ADJ, MASU, TE, PAST, VSN } = W;
const rules: Rule[] = [];
const add = (from: string, to: string, inCls: number, out: number, why: string) => rules.push({ from, to, in: inCls, out, why });

// ---- Godan verbs: one row per dictionary ending ----------------------------
// [dictionary ending, a-row, i-row, e-row, o-row, te-form ending]
const GODAN: [string, string, string, string, string, string][] = [
  ['う', 'わ', 'い', 'え', 'お', 'って'],
  ['く', 'か', 'き', 'け', 'こ', 'いて'],
  ['ぐ', 'が', 'ぎ', 'げ', 'ご', 'いで'],
  ['す', 'さ', 'し', 'せ', 'そ', 'して'],
  ['つ', 'た', 'ち', 'て', 'と', 'って'],
  ['ぬ', 'な', 'に', 'ね', 'の', 'んで'],
  ['ぶ', 'ば', 'び', 'べ', 'ぼ', 'んで'],
  ['む', 'ま', 'み', 'め', 'も', 'んで'],
  ['る', 'ら', 'り', 'れ', 'ろ', 'って'],
];
for (const [d, a, i, e, o, te] of GODAN) {
  const ta = te.slice(0, -1) + (te.endsWith('で') ? 'だ' : 'た');
  add(a + 'ない', d, ADJ, V5, 'negative');
  add(a + 'ず', d, ANY, V5, 'negative (ず)');
  add(a + 'ずに', d, ANY, V5, 'without doing');
  add(a + 'ん', d, ANY, V5, 'negative (ん)');
  add(a + 'ねえ', d, ANY, V5, 'negative (casual)');
  add(a + 'ねぇ', d, ANY, V5, 'negative (casual)');
  add(a + 'れる', d, V1, V5, 'passive');
  add(a + 'せる', d, V1, V5, 'causative');
  add(a + 'される', d, V1, V5, 'causative passive');
  add(i + 'ます', d, MASU, V5, 'polite');
  add(i, d, ANY, V5, 'stem');
  add(i + 'たい', d, ADJ, V5, 'want to');
  add(i + 'そう', d, ANY, V5, 'looks like');
  add(i + 'すぎる', d, V1, V5, 'too much');
  add(i + 'なさい', d, ANY, V5, 'command (なさい)');
  add(e, d, ANY, V5, 'command');
  add(e + 'ば', d, ANY, V5, 'conditional');
  add(e + 'る', d, V1, V5, 'potential');
  add(o + 'う', d, ANY, V5, 'volitional');
  add(te, d, ANY | TE, V5, 'te-form');
  add(ta, d, ANY | PAST, V5, 'past');
}
// 行く is irregular in the te- and past forms.
for (const s of ['行', 'い']) {
  add(s + 'って', s + 'く', ANY | TE, V5, 'te-form');
  add(s + 'った', s + 'く', ANY | PAST, V5, 'past');
}
// いらっしゃる, おっしゃる, くださる, なさる, ござる: polite stem and command in い.
add('います', 'る', MASU, V5, 'polite');
add('い', 'る', ANY, V5, 'command');

// ---- Ichidan verbs: stem + る -----------------------------------------------
const ICHIDAN: [string, number, string][] = [
  ['ない', ADJ, 'negative'],
  ['ず', ANY, 'negative (ず)'],
  ['ずに', ANY, 'without doing'],
  ['ん', ANY, 'negative (ん)'],
  ['ねえ', ANY, 'negative (casual)'],
  ['ます', MASU, 'polite'],
  ['', ANY, 'stem'],
  ['たい', ADJ, 'want to'],
  ['そう', ANY, 'looks like'],
  ['すぎる', V1, 'too much'],
  ['なさい', ANY, 'command (なさい)'],
  ['ろ', ANY, 'command'],
  ['よ', ANY, 'command'],
  ['れば', ANY, 'conditional'],
  ['よう', ANY, 'volitional'],
  ['られる', V1, 'passive or potential'],
  ['れる', V1, 'potential (casual)'],
  ['させる', V1, 'causative'],
  ['て', ANY | TE, 'te-form'],
  ['た', ANY | PAST, 'past'],
];
for (const [suffix, inCls, why] of ICHIDAN) add(suffix, 'る', inCls, V1, why);

// ---- する and 来る ------------------------------------------------------------
const SURU: [string, number, string][] = [
  ['しない', ADJ, 'negative'],
  ['せず', ANY, 'negative (ず)'],
  ['せずに', ANY, 'without doing'],
  ['せん', ANY, 'negative (ん)'],
  ['します', MASU, 'polite'],
  ['し', ANY, 'stem'],
  ['したい', ADJ, 'want to'],
  ['しそう', ANY, 'looks like'],
  ['しすぎる', V1, 'too much'],
  ['しなさい', ANY, 'command (なさい)'],
  ['しろ', ANY, 'command'],
  ['せよ', ANY, 'command'],
  ['すれば', ANY, 'conditional'],
  ['しよう', ANY, 'volitional'],
  ['される', V1, 'passive'],
  ['させる', V1, 'causative'],
  ['できる', V1, 'potential'],
  ['して', ANY | TE, 'te-form'],
  ['した', ANY | PAST, 'past'],
];
for (const [suffix, inCls, why] of SURU) add(suffix, 'する', inCls, VS, why);
add('する', '', VS, VSN, 'する verb');

const KURU: [string, number, string][] = [
  ['こない', ADJ, 'negative'],
  ['こず', ANY, 'negative (ず)'],
  ['こん', ANY, 'negative (ん)'],
  ['きます', MASU, 'polite'],
  ['き', ANY, 'stem'],
  ['きたい', ADJ, 'want to'],
  ['こい', ANY, 'command'],
  ['くれば', ANY, 'conditional'],
  ['こよう', ANY, 'volitional'],
  ['こられる', V1, 'passive or potential'],
  ['これる', V1, 'potential (casual)'],
  ['こさせる', V1, 'causative'],
  ['きて', ANY | TE, 'te-form'],
  ['きた', ANY | PAST, 'past'],
];
for (const [suffix, inCls, why] of KURU) {
  add(suffix, 'くる', inCls, VK, why);
  add('来' + suffix.slice(1), '来る', inCls, VK, why);
}

// ---- i-adjectives -----------------------------------------------------------
const ADJECTIVE: [string, number, string][] = [
  ['く', ANY, 'adverb'],
  ['くない', ADJ, 'negative'],
  ['かった', ANY | PAST, 'past'],
  ['くて', ANY | TE, 'te-form'],
  ['ければ', ANY, 'conditional'],
  ['きゃ', ANY, 'conditional (casual)'],
  ['くちゃ', ANY, 'conditional (casual)'],
  ['かろう', ANY, 'presumptive'],
  ['さ', ANY, 'noun (〜さ)'],
  ['そう', ANY, 'looks like'],
  ['すぎる', V1, 'too much'],
  ['くなる', V5, 'becomes'],
];
for (const [suffix, inCls, why] of ADJECTIVE) add(suffix, 'い', inCls, ADJ, why);

// ---- Auxiliaries after the te-form -------------------------------------------
const AFTER_TE: [string, number, string][] = [
  ['いる', V1, 'ongoing (ている)'],
  ['おる', V5, 'ongoing, humble (ておる)'],
  ['る', V1, 'ongoing (てる)'],
  ['ある', V5, 'resulting state (てある)'],
  ['おく', V5, 'in advance (ておく)'],
  ['しまう', V5, 'completely (てしまう)'],
  ['いく', V5, 'going on (ていく)'],
  ['くる', VK, 'coming (てくる)'],
  ['みる', V1, 'try (てみる)'],
  ['くれる', V1, 'for me (てくれる)'],
  ['もらう', V5, 'have done (てもらう)'],
  ['いただく', V5, 'have done (ていただく)'],
  ['あげる', V1, 'for someone (てあげる)'],
  ['ください', ANY, 'please (てください)'],
  ['は', ANY, 'if (ては)'],
  ['も', ANY, 'even if (ても)'],
];
for (const [aux, inCls, why] of AFTER_TE) {
  add('て' + aux, 'て', inCls, TE, why);
  add('で' + aux, 'で', inCls, TE, why);
}
// Contractions: とく = ておく, ちゃう = てしまう, ちゃ = ては.
add('とく', 'て', V5, TE, 'in advance (とく)');
add('どく', 'で', V5, TE, 'in advance (とく)');
add('ちゃう', 'て', V5, TE, 'completely (ちゃう)');
add('じゃう', 'で', V5, TE, 'completely (ちゃう)');
add('ちゃ', 'て', ANY, TE, 'if (ちゃ)');
add('じゃ', 'で', ANY, TE, 'if (ちゃ)');

// ---- Past, polite and negative add-ons -----------------------------------------
add('たら', 'た', ANY, PAST, 'if (たら)');
add('だら', 'だ', ANY, PAST, 'if (たら)');
add('たり', 'た', ANY, PAST, 'and so on (たり)');
add('だり', 'だ', ANY, PAST, 'and so on (たり)');
add('ました', 'ます', ANY, MASU, 'past');
add('ません', 'ます', ANY, MASU, 'negative');
add('ませんでした', 'ます', ANY, MASU, 'negative past');
add('ましょう', 'ます', ANY, MASU, 'let’s');
add('まして', 'ます', ANY | TE, MASU, 'te-form');
add('ませ', 'ます', ANY, MASU, 'command');
add('ないで', 'ない', ANY, ADJ, 'without (ないで)');
add('なきゃ', 'ない', ANY, ADJ, 'must (なきゃ)');
add('です', '', ANY, ALL, 'です');
add('ください', '', ANY, ALL, 'please (お〜ください)');
add('でした', '', ANY, ALL, 'でした');

export const RULES: readonly Rule[] = rules;

const MAX_DEPTH = 8;

/**
 * Every form the text could be the inflection of, including the text itself
 * (first, with no reasons). Breadth first, so shorter chains come first.
 */
export function deinflect(text: string): Candidate[] {
  const start: Candidate = { term: text, cls: ANY, reasons: [] };
  const out: Candidate[] = [start];
  const seen = new Set([`${text}|${ANY}`]);
  let frontier = [start];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    const next: Candidate[] = [];
    for (const c of frontier) {
      for (const r of RULES) {
        // The text as given could be any form, so every rule may apply to it.
        if (((c.cls & ANY) === 0 && (r.in & c.cls) === 0) || !c.term.endsWith(r.from)) continue;
        const term = c.term.slice(0, c.term.length - r.from.length) + r.to;
        if (term === '') continue;
        const key = `${term}|${r.out}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cand = { term, cls: r.out, reasons: [r.why, ...c.reasons] };
        out.push(cand);
        next.push(cand);
      }
    }
    frontier = next;
  }
  return out;
}

/** The word classes a dictionary entry's parts of speech allow. */
export function classesOf(pos: Iterable<string>): number {
  let cls = 0;
  for (const p of pos) {
    if (p === 'v1' || p === 'v1-s') cls |= V1;
    else if (p.startsWith('v5')) cls |= V5;
    else if (p === 'vs-i' || p === 'vs-s') cls |= VS;
    else if (p === 'vs') cls |= VSN;
    else if (p === 'vk') cls |= VK;
    else if (p === 'adj-i' || p === 'adj-ix') cls |= ADJ;
  }
  return cls;
}
