// Builds the offline dictionary served from the app's own origin under dict/.
//
//   DICT_SOURCE=path/to/jmdict-examples-eng-X.json(.zip) node scripts/build-dict.mjs
//
// Input: a jmdict-simplified JSON file (https://github.com/scriptin/jmdict-simplified),
// plain or zipped. The English file with examples is preferred; the plain
// English file works too (no example sentences).
// Output: public/dict/manifest.json and public/dict/jmdict-HASH.ndjson.gz,
// one compact entry per line (see src/dict/entry.ts). public/dict is generated
// and git-ignored.
//
// Without DICT_SOURCE the build has no dictionary: public/dict is removed and
// the app says "not available in this build". With DICT_OPTIONAL=1 a source
// that is missing or unreadable does the same instead of failing the build,
// so a deploy survives a failed data download.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'dict');
const MB = 1024 * 1024;

// Reading tags that make a spelling a poor choice for the card's reading.
const ODD_READING = new Set(['ik', 'ok', 'sk', 'rk']);
const ODD_KANJI = new Set(['iK', 'oK', 'sK', 'rK', 'io']);

/** The Japanese and English text of a jmdict-simplified example, tolerating either key spelling. */
function examplePair(ex) {
  const sentences = Array.isArray(ex?.sentences) ? ex.sentences : [];
  const pick = (lang) => sentences.find((s) => (s.land ?? s.lang) === lang)?.text;
  const ja = pick('jpn');
  const en = pick('eng');
  return typeof ja === 'string' && typeof en === 'string' ? [ja, en] : null;
}

/** One jmdict-simplified word → the compact entry the app stores. */
export function compactWord(word, maxExamples = 2) {
  const kanji = word.kanji ?? [];
  const kana = word.kana ?? [];
  const byOddness = (odd) => (a, b) => Number(a.tags.some((t) => odd.has(t))) - Number(b.tags.some((t) => odd.has(t)));
  const k = [...kanji].sort(byOddness(ODD_KANJI)).map((x) => x.text);
  const readings = [...kana].sort(byOddness(ODD_READING));
  const entry = { i: Number(word.id), k, r: readings.map((x) => x.text) };
  const rk = {};
  for (const x of kana) {
    const to = x.appliesToKanji ?? ['*'];
    if (!(to.length === 1 && to[0] === '*')) rk[x.text] = to;
  }
  if (Object.keys(rk).length) entry.rk = rk;
  const rx = kana.filter((x) => x.tags.some((t) => ODD_READING.has(t))).map((x) => x.text);
  if (rx.length) entry.rx = rx;
  if (kanji.some((x) => x.common) || kana.some((x) => x.common)) entry.c = 1;

  let lastPos = [];
  entry.s = (word.sense ?? []).map((s) => {
    const out = { g: (s.gloss ?? []).filter((g) => !g.lang || g.lang === 'eng').map((g) => g.text) };
    // JMdict omits a repeated part of speech; carry the previous one forward.
    const pos = s.partOfSpeech?.length ? s.partOfSpeech : lastPos;
    lastPos = pos;
    if (pos.length) out.p = pos;
    if (s.misc?.length) out.m = s.misc;
    if (s.field?.length) out.f = s.field;
    if (s.dialect?.length) out.d = s.dialect;
    if (s.info?.length) out.n = s.info;
    const all = (a) => !a || (a.length === 1 && a[0] === '*');
    if (!all(s.appliesToKanji)) out.ak = s.appliesToKanji;
    if (!all(s.appliesToKana)) out.ar = s.appliesToKana;
    if (maxExamples > 0 && Array.isArray(s.examples)) {
      const x = s.examples.map(examplePair).filter(Boolean).slice(0, maxExamples);
      if (x.length) out.x = x;
    }
    return out;
  });
  const labels = new Set(entry.s.flatMap((s) => [...(s.m ?? []), ...(s.f ?? []), ...(s.d ?? [])]));
  if (labels.size) entry.t = [...labels];
  return entry;
}

/** Compact a whole jmdict-simplified file. */
export function buildDict(json, maxExamples = 2) {
  if (!json || !Array.isArray(json.words)) throw new Error('not a jmdict-simplified file (no "words" array)');
  const entries = [];
  let examples = 0;
  for (const w of json.words) {
    const e = compactWord(w, maxExamples);
    if (e.s.length === 0 || e.s.every((s) => s.g.length === 0)) continue; // no English
    for (const s of e.s) examples += s.x?.length ?? 0;
    entries.push(e);
  }
  const text = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  return { entries: entries.length, examples, text };
}

function readSource(file) {
  if (file.endsWith('.zip')) {
    return execFileSync('unzip', ['-p', file], { maxBuffer: 1024 * MB }).toString('utf8');
  }
  return readFileSync(file, 'utf8');
}

function main() {
  const source = process.env.DICT_SOURCE;
  const optional = process.env.DICT_OPTIONAL === '1';
  const maxMb = Number(process.env.DICT_MAX_MB || 15);
  rmSync(OUT, { recursive: true, force: true });
  if (!source) {
    console.log('dictionary: none in this build (set DICT_SOURCE to include one)');
    return;
  }
  try {
    if (!existsSync(source)) throw new Error(`${source} does not exist`);
    const json = JSON.parse(readSource(source));
    const fixture = json.version === 'fixture';
    // Over budget: drop example sentences before anything else, never words.
    let built;
    let gz;
    for (const maxExamples of [2, 1, 0]) {
      built = buildDict(json, maxExamples);
      gz = gzipSync(built.text, { level: 9 });
      console.log(`dictionary: ${built.entries} entries, ${built.examples} examples (max ${maxExamples}/sense): ${(built.text.length / MB).toFixed(1)} MB raw, ${(gz.length / MB).toFixed(2)} MB gzip`);
      if (gz.length <= maxMb * MB) break;
    }
    if (built.entries === 0) throw new Error('no entries with English glosses');
    const hash = createHash('sha256').update(gz).digest('hex').slice(0, 12);
    const file = `jmdict-${hash}.ndjson.gz`;
    mkdirSync(OUT, { recursive: true });
    writeFileSync(path.join(OUT, file), gz);
    const manifest = {
      version: `${json.dictDate ?? 'unknown'}-${hash}`,
      file,
      bytes: gz.length,
      rawBytes: Buffer.byteLength(built.text),
      entries: built.entries,
      examples: built.examples,
      format: 2,
      source: fixture
        ? 'test fixture (not real JMdict data)'
        : `JMdict ${json.dictDate ?? ''} via jmdict-simplified ${json.version ?? ''}`.replace(/\s+/g, ' ').trim(),
      ...(fixture ? { fixture: true } : {}),
    };
    writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
    console.log(`dictionary: wrote public/dict/${file} (${manifest.source})`);
  } catch (err) {
    rmSync(OUT, { recursive: true, force: true });
    if (optional) {
      console.warn(`::warning::dictionary not built, continuing without it: ${err.message}`);
      return;
    }
    console.error(`dictionary: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
