// Writes dict-sample.json: a small hand-written stand-in for the real
// JMdict file, in jmdict-simplified's JSON shape. Used by unit tests and by
// the browser run-through. Glosses are paraphrased for testing, not copied
// from JMdict. Ids start at 9000000 so they can't be mistaken for real ones.
//   node tests/fixtures/make-dict-sample.mjs
import { writeFileSync } from 'node:fs';

// [kanji forms, kana forms, common, senses]; sense: [pos, glosses, extra]
const W = [
  [['承る'], ['うけたまわる'], true, [
    [['v5r', 'vt'], ['to hear', 'to be told', 'to know'], { m: ['hum'] }],
    [['v5r', 'vt'], ['to receive (an order)', 'to undertake', 'to take (a booking)'], { m: ['hum'], x: [['ご注文を承りました。', 'We have received your order.']] }],
  ]],
  [['稟議'], ['りんぎ'], false, [[['n', 'vs'], ['circulating a proposal for approval', 'decision by circular'], { f: ['bus'] }]]],
  [['稟議書'], ['りんぎしょ'], false, [[['n'], ['written proposal circulated for approval'], { f: ['bus'] }]]],
  [['取り次ぐ', '取次ぐ'], ['とりつぐ'], true, [[['v5g', 'vt'], ['to pass on (a message)', 'to put (a call) through', 'to act as agent']]]],
  [['待つ'], ['まつ'], true, [[['v5t', 'vt'], ['to wait', 'to await']]]],
  [['確認'], ['かくにん'], true, [[['n', 'vs', 'vt'], ['confirmation', 'checking', 'verification']]]],
  [['食べる'], ['たべる'], true, [[['v1', 'vt'], ['to eat']]]],
  [['着る'], ['きる'], true, [[['v1', 'vt'], ['to wear', 'to put on (clothes)']]]],
  [['切る'], ['きる'], true, [[['v5r', 'vt'], ['to cut', 'to slice']]]],
  [['買う'], ['かう'], true, [[['v5u', 'vt'], ['to buy', 'to purchase']]]],
  [['飼う'], ['かう'], true, [[['v5u', 'vt'], ['to keep (a pet)', 'to raise (animals)']]]],
  [['行く'], ['いく', 'ゆく'], true, [[['v5k-s', 'vi'], ['to go', 'to head for']]]],
  [['来る'], ['くる'], true, [[['vk', 'vi'], ['to come', 'to arrive']]]],
  [['為る'], ['する'], true, [[['vs-i'], ['to do', 'to carry out'], { m: ['uk'] }]]],
  [['高い'], ['たかい'], true, [[['adj-i'], ['high', 'tall']], [['adj-i'], ['expensive']]]],
  [['良い'], ['よい', 'いい'], true, [[['adj-ix'], ['good', 'fine', 'nice']]]],
  [['説明'], ['せつめい'], true, [[['n', 'vs', 'vt'], ['explanation', 'description']]]],
  [['齟齬'], ['そご'], false, [[['n', 'vs', 'vi'], ['discrepancy', 'inconsistency', 'mismatch']]]],
  [['お世話'], ['おせわ'], true, [[['n'], ['help', 'assistance', 'care'], { m: ['pol'] }]]],
  [['平素'], ['へいそ'], false, [[['n', 'adv'], ['ordinarily', 'usually'], { m: ['form'] }]]],
  [['矢場い'], ['やばい', 'ヤバい'], true, [
    [['adj-i'], ['dangerous', 'risky'], { m: ['col', 'uk'] }],
    [['adj-i'], ['awful', 'terrible', 'not good'], { m: ['col', 'uk'] }],
    [['adj-i'], ['amazing', 'awesome', 'incredible'], { m: ['sl', 'uk'], x: [['このラーメン、ヤバい！', 'This ramen is amazing!']] }],
  ]],
  [[], ['マジ', 'まじ'], true, [[['adj-na', 'n'], ['serious', 'not joking', 'for real'], { m: ['col'] }]]],
  [['受ける'], ['うける', 'ウケる'], true, [
    [['v1', 'vt'], ['to receive', 'to get']],
    [['v1', 'vi'], ['to go over well', 'to be popular']],
    [['v1', 'vi'], ['to find funny', 'to be amused'], { m: ['col', 'uk'] }],
  ]],
  [[], ['めっちゃ', 'メッチャ'], true, [[['adv'], ['very', 'really', 'super'], { m: ['col'], d: ['ksb'] }]]],
  [[], ['ガチ', 'がち'], false, [[['adj-na', 'adv', 'n'], ['serious', 'for real', 'hardcore'], { m: ['sl'] }]]],
  [[], ['キモい', 'きもい'], false, [[['adj-i'], ['gross', 'creepy', 'disgusting'], { m: ['sl'] }]]],
  [[], ['ググる'], false, [[['v5r', 'vt'], ['to google (something)'], { m: ['net-sl'] }]]],
  [['草'], ['くさ'], true, [
    [['n'], ['grass', 'weeds']],
    [['n', 'int'], ['lol', 'LOL'], { m: ['net-sl'], x: [['それは草。', 'That is hilarious.']] }],
  ]],
  [['知る'], ['しる'], true, [[['v5r', 'vt'], ['to know', 'to find out']]]],
  [['分かる', '解る', '判る'], ['わかる'], true, [[['v5r', 'vi'], ['to understand', 'to grasp']]]],
  [['見る'], ['みる'], true, [[['v1', 'vt'], ['to see', 'to look at']]]],
  [[], ['いらっしゃる'], true, [[['v5aru', 'vi'], ['to come', 'to go', 'to be (somewhere)'], { m: ['hon'] }]]],
  [['申す'], ['もうす'], true, [[['v5s', 'vt'], ['to say', 'to be called'], { m: ['hum'] }]]],
  [['拝見'], ['はいけん'], true, [[['n', 'vs', 'vt'], ['seeing', 'looking at'], { m: ['hum'] }]]],
  [['伺う'], ['うかがう'], true, [[['v5u', 'vt'], ['to ask', 'to inquire'], { m: ['hum'] }], [['v5u', 'vi'], ['to visit', 'to call on'], { m: ['hum'] }]]],
  [['案件'], ['あんけん'], true, [[['n'], ['matter', 'item of business', 'case'], { f: ['bus'] }]]],
  [['根回し'], ['ねまわし'], false, [[['n', 'vs'], ['laying the groundwork', 'informal consensus-building'], { f: ['bus'] }]]],
  [['了解'], ['りょうかい'], true, [[['n', 'vs', 'vt'], ['understanding', 'consent', 'roger']]]],
  [['合う'], ['あう'], true, [[['v5u', 'vi'], ['to fit', 'to match', 'to agree']]]],
  [['会う'], ['あう'], true, [[['v5u', 'vi'], ['to meet', 'to see (someone)']]]],
  [['書く'], ['かく'], true, [[['v5k', 'vt'], ['to write']]]],
  [['寝る'], ['ねる'], true, [[['v1', 'vi'], ['to sleep', 'to go to bed']]]],
  [['無い'], ['ない'], true, [[['adj-i'], ['nonexistent', 'not being (there)'], { m: ['uk'] }]]],
  [['美味しい'], ['おいしい'], true, [[['adj-i'], ['delicious', 'tasty'], { m: ['uk'] }]]],
  [['按分', '案分'], ['あんぶん'], false, [[['n', 'vs', 'vt'], ['proportional division', 'apportionment']]]],
  [['担当'], ['たんとう'], true, [[['n', 'vs', 'vt'], ['being in charge (of)', 'responsibility']]]],
  [['少々'], ['しょうしょう'], true, [[['adv', 'n'], ['just a minute', 'a little', 'a few']]]],
  [['大変'], ['たいへん'], true, [[['adv'], ['very', 'greatly']], [['adj-na'], ['serious', 'hard', 'terrible']]]],
  [[], ['どきどき', 'ドキドキ'], true, [[['adv', 'adv-to', 'vs'], ['thump-thump (heartbeat)', 'nervous', 'excited'], { m: ['on-mim'], x: [['面接の前はいつもドキドキする。', 'I always get nervous before an interview.']] }]]],
  [[], ['にこにこ', 'ニコニコ'], true, [[['adv', 'adv-to', 'vs'], ['with a smile', 'smiling'], { m: ['on-mim'] }]]],
  [[], ['うざい', 'ウザい'], false, [[['adj-i'], ['annoying', 'irritating'], { m: ['col'] }]]],
];

const TAGS = {
  v5r: 'Godan verb with ru ending', v5g: 'Godan verb with gu ending', v5t: 'Godan verb with tsu ending', v5u: 'Godan verb with u ending',
  v5k: 'Godan verb with ku ending', 'v5k-s': 'Godan verb - Iku/Yuku special class', v5s: 'Godan verb with su ending', v5aru: 'Godan verb - -aru special class',
  v1: 'Ichidan verb', vk: 'Kuru verb - special class', 'vs-i': 'suru verb - included', vs: 'noun or participle which takes the aux. verb suru',
  vt: 'transitive verb', vi: 'intransitive verb', n: 'noun (common) (futsuumeishi)', adv: 'adverb (fukushi)', int: 'interjection (kandoushi)',
  'adj-i': 'adjective (keiyoushi)', 'adj-ix': 'adjective (keiyoushi) - yoi/ii class', 'adj-na': 'adjectival nouns or quasi-adjectives (keiyodoshi)',
  hum: 'humble (kenjougo) language', hon: 'honorific or respectful (sonkeigo) language', pol: 'polite (teineigo) language', form: 'formal or literary term',
  col: 'colloquial', 'on-mim': 'onomatopoeic or mimetic word', 'adv-to': 'adverb taking the to particle', sl: 'slang', 'net-sl': 'Internet slang', uk: 'word usually written using kana alone', bus: 'business', ksb: 'Kansai-ben',
};

let id = 9000000;
let ex = 1;
const words = W.map(([kanji, kana, common, senses]) => ({
  id: String(++id),
  kanji: kanji.map((text, i) => ({ common: common && i === 0, text, tags: [] })),
  kana: kana.map((text, i) => ({ common: common && i === 0, text, tags: [], appliesToKanji: ['*'] })),
  sense: senses.map(([pos, glosses, extra = {}]) => ({
    partOfSpeech: pos,
    appliesToKanji: ['*'],
    appliesToKana: extra.ar ?? ['*'],
    related: [],
    antonym: [],
    field: extra.f ?? [],
    dialect: extra.d ?? [],
    misc: extra.m ?? [],
    info: [],
    languageSource: [],
    gloss: glosses.map((text) => ({ lang: 'eng', gender: null, type: null, text })),
    ...(extra.x
      ? {
          examples: extra.x.map(([ja, en]) => ({
            source: { type: 'tatoeba', value: String(ex++) },
            text: kanji[0] ?? kana[0],
            sentences: [
              { land: 'jpn', text: ja },
              { land: 'eng', text: en },
            ],
          })),
        }
      : {}),
  })),
}));

const out = { version: 'fixture', languages: ['eng'], dictDate: '2026-11-17', commonOnly: false, dictRevisions: [], tags: TAGS, words };
writeFileSync(new URL('./dict-sample.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`dict-sample.json: ${words.length} entries`);
