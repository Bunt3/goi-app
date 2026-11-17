/**
 * Starter deck: modern casual, youth and internet slang, mostly documented
 * 2016–2026. Machine-written and NOT checked by a native speaker; every card
 * is tagged seed-unverified. The source column names the ranking or explainer
 * where the term was found (search summaries, 2026-11); '' means it was not
 * checked. Short-lived catchphrases (ほんmoney, ひき肉です …) are left out;
 * words now considered dated are kept in their own group so they can be
 * recognised rather than used.
 */
import { interleave, type PackRow } from './common';

const C = 'casual' as const;
const S22 = '三省堂 今年の新語 2022';
const S24 = '三省堂 今年の新語 2024';
const S25 = '三省堂 今年の新語 2025';

const FEELINGS: PackRow[] = [
  ['エモい', 'えもい', 'stirring, wistful, nostalgic in a way that’s hard to put into words', 'この写真、夕焼けがすごくエモい。', 'The sunset in this photo is so moving.', C, '三省堂 今年の新語 2016 (2位)'],
  ['チルい', 'ちるい', 'chill, relaxed, cosy', '休日は海の見えるカフェでチルい時間を過ごした。', 'I spent a chill afternoon at a café by the sea.', C, '三省堂 今年の新語 2021 (大賞)'],
  ['メロい', 'めろい', 'so attractive you go weak (from メロメロ)', 'あの俳優、笑った顔がメロい。', 'That actor’s smile makes me melt.', C, `${S24} (6位); JC・JK流行語大賞 2025`],
  ['尊い', 'とうとい', '(fandom) so precious it’s overwhelming', '二人が仲良くしているのを見るだけで尊い。', 'Just seeing the two of them getting along is too precious.', C, 'FUN! JAPAN 解説'],
  ['エグい', 'えぐい', 'insane: amazing, or harsh (context decides)', 'この新作ゲーム、グラフィックがエグい。', 'The graphics in this new game are insane.', C, 'Unseen Japan 解説'],
  ['しんどい', 'しんどい', 'exhausting; (fandom) so good it hurts', '推しの新曲が良すぎてしんどい。', 'My favourite’s new song is so good it hurts.', C, 'TCJ 解説'],
  ['横転', 'おうてん', '“I keeled over”: floored, cracking up (online)', 'そのオチは予想外すぎて横転した。', 'That punchline was so unexpected I fell over laughing.', C, `${S24} (2位)`],
  ['顔ない', 'かおない', 'too embarrassed to show my face', '昨日の飲み会で寝ちゃって、顔ない。', 'I fell asleep at last night’s drinks; I can’t show my face.', C, `${S24} (10位)`],
  ['きまず', 'きまず', '“awkward!” (clipped 気まずい)', '元カレとエレベーターで二人きり。きまず。', 'Alone in the lift with my ex. Awkward.', C, `${S22} (3位)`],
  ['しゃばい', 'しゃばい', 'lame, uncool (revived old delinquent slang)', 'そんな言い訳、しゃばいって。', 'That excuse is so lame.', C, `${S25} (4位)`],
  ['優勝', 'ゆうしょう', '“this wins”: perfect (food, drink, a moment)', '風呂上がりのビール、優勝。', 'A beer after a bath: unbeatable.', C, ''],
  ['無理', 'むり', '“I can’t” (too good or too much to handle)', '推しの笑顔が可愛すぎて無理。', 'My favourite’s smile is too cute, I can’t.', C, ''],
  ['ととのう', 'ととのう', 'that blissful reset after sauna and cold bath', 'サウナと水風呂を三回繰り返したら、完全にととのった。', 'After three rounds of sauna and cold bath, I was totally reset.', C, '新語・流行語大賞 2021 候補'],
];

const SHORT: PackRow[] = [
  ['とりま', 'とりま', 'for now, anyway (とりあえず、まあ)', 'とりま駅前集合で。', 'For now, let’s meet in front of the station.', C, 'Oggi 解説'],
  ['りょ', 'りょ', '“OK” in chat (了解); friends only', '明日10時ね。— りょ。', 'Tomorrow at 10, then. — OK.', C, 'Oggi 解説'],
  ['あざす', 'あざす', 'thanks (clipped ありがとうございます); peers, sporty', '資料送っといたよ。— あざす！', 'I sent you the file. — Thanks!', C, ''],
  ['それな', 'それな', 'totally; “right?” (strong agreement)', '月曜の朝ってだるいよね。— それな。', 'Monday mornings are such a drag. — Totally.', C, 'Oggi; DIME'],
  ['あーね', 'あーね', '“ah, I see” (can sound curt)', '電車止まってたから遅れた。— あーね。', 'I was late because the trains stopped. — Ah, got it.', C, 'Oggi 解説'],
  ['ワンチャン', 'わんちゃん', 'maybe; there’s a (slim) chance', '今から走れば、ワンチャン間に合うかも。', 'If we run now, we might just make it.', C, 'Oggi 解説'],
  ['微レ存', 'びれぞん', 'a tiny but non-zero chance (微粒子レベルで存在)', '彼が来る可能性も微レ存。', 'There’s a microscopic chance he’ll come.', C, 'Oggi 解説'],
  ['ちな', 'ちな', 'by the way (ちなみに)', 'ちな、明日は雨らしいよ。', 'By the way, it’s supposed to rain tomorrow.', C, ''],
  ['秒で', 'びょうで', 'in seconds; instantly', 'そのチケット、秒で売り切れた。', 'Those tickets sold out in seconds.', C, ''],
  ['ビジュ', 'びじゅ', 'looks; visual vibe (ビジュアル)', '今日のビジュ、最高じゃない？', 'Aren’t you looking amazing today?', C, `${S25} (大賞)`],
  ['しごでき', 'しごでき', 'great at their job (仕事ができる); しごできおじさん ironic', '彼女、しごできすぎて尊敬する。', 'She’s so good at her job, I really look up to her.', C, `${S24} (4位)`],
  ['風呂キャン', 'ふろきゃん', 'skipping the bath (風呂キャンセル)', '疲れすぎて昨日は風呂キャンした。', 'I was too tired and skipped my bath last night.', C, 'DIME 解説'],
  ['コスパ', 'こすぱ', 'value for money (コストパフォーマンス)', 'この店はランチのコスパがいい。', 'This place’s lunch is great value.', C, ''],
  ['ネタバレ', 'ねたばれ', 'spoiler', 'まだ見てないから、ネタバレしないで！', 'I haven’t seen it yet, so no spoilers!', C, ''],
];

const FANDOM: PackRow[] = [
  ['推し', 'おし', 'your favourite (idol, actor, character…)', '私の推しは、このグループの最年少メンバーです。', 'My favourite is the youngest member of this group.', C, 'FUN! JAPAN 解説'],
  ['推し活', 'おしかつ', 'fan activities for your favourite', '週末は推し活でライブに行く。', 'This weekend I’m going to a concert for my fan activities.', C, '新語・流行語大賞 2021 候補'],
  ['推し変', 'おしへん', 'switching to a new favourite', '新メンバーが入って、推し変しそう。', 'With the new member joining, I might switch favourites.', C, 'チケット流通センター 解説'],
  ['箱推し', 'はこおし', 'supporting the whole group, not one member', 'みんな好きだから箱推しです。', 'I like them all, so I support the whole group.', C, 'チケット流通センター 解説'],
  ['現場', 'げんば', '(fandom) a live event or concert', '今月は現場が三つもある。', 'I have three live events this month.', C, 'チケット流通センター 解説'],
  ['同担拒否', 'どうたんきょひ', 'refusing to befriend fans of the same favourite', '私は同担拒否なので、同じ推しの人とは話さない。', 'I don’t mix with fans of the same member, so I don’t talk to them.', C, 'Weblio'],
  ['解釈違い', 'かいしゃくちがい', 'clashes with how I see the character', 'あのキャラがそんなこと言うなんて解釈違いだ。', 'That character saying that clashes with how I see them.', C, 'ニコニコ大百科'],
  ['解釈一致', 'かいしゃくいっち', 'exactly how I see the character', '公式の新しいイラスト、完全に解釈一致。', 'The new official art is exactly how I imagine them.', C, 'ニコニコ大百科'],
  ['ガチ恋', 'がちこい', 'genuinely in love with an idol or creator', '彼女はあのアイドルにガチ恋している。', 'She’s genuinely in love with that idol.', C, 'BCN 解説'],
  ['アクスタ', 'あくすた', 'acrylic stand (merch figure)', '推しのアクスタを連れてカフェに来た。', 'I brought my favourite’s acrylic stand to the café.', C, '三省堂 今年の新語 2023 (6位)'],
  ['ぬい活', 'ぬいかつ', 'taking plushies out and photographing them', '旅行先でぬい活するのが楽しみ。', 'I’m looking forward to taking photos of my plushie on the trip.', C, '新語・流行語大賞 2025 候補'],
  ['沼', 'ぬま', 'something you get hopelessly hooked on (沼る = get hooked)', '一度見たら抜けられない、まさに沼。', 'Watch it once and you can’t get out; it’s a total rabbit hole.', C, ''],
  ['限界オタク', 'げんかいおたく', 'a fan overwhelmed past coping (self-mocking)', '新曲の発表で、限界オタクになった。', 'The new song announcement turned me into a total mess of a fan.', C, ''],
  ['ファンサ', 'ふぁんさ', 'fan service (a wave, a look from the stage)', 'ライブで推しからファンサをもらった！', 'My favourite gave me fan service at the concert!', C, ''],
];

const ONLINE: PackRow[] = [
  ['バズる', 'ばずる', 'to go viral', '何気なく投稿した写真がバズった。', 'A photo I posted on a whim went viral.', C, 'NativeCamp 解説'],
  ['草', 'くさ', 'lol (from www); online, written', 'その返し、草。', 'That comeback, lol.', C, 'moov 解説'],
  ['匂わせ', 'におわせ', 'posts hinting at a secret partner', 'その写真、完全に匂わせじゃん。', 'That photo is totally hinting at a boyfriend.', C, 'Oggi 解説'],
  ['鍵垢', 'かぎあか', 'a private (locked) account', '本音は鍵垢でしか言わない。', 'I only say what I really think on my private account.', C, 'Web担当者Forum'],
  ['裏垢', 'うらあか', 'an anonymous alt account', '会社の人には裏垢を教えていない。', 'I haven’t told anyone at work about my alt account.', C, 'lifestyle 解説'],
  ['ROM専', 'ろむせん', 'a lurker (read-only member)', 'SNSはほぼROM専です。', 'I mostly just lurk on social media.', C, 'BCN 解説'],
  ['エゴサ', 'えごさ', 'searching for your own name online', '新作の評判が気になってエゴサした。', 'I was curious about reactions to my new work, so I searched my name.', C, 'meetsmore 解説'],
  ['インプレ', 'いんぷれ', 'impressions (view count on a post)', 'この投稿、インプレが一万を超えた。', 'This post passed ten thousand impressions.', C, `${S24} (3位)`],
  ['リポスト', 'りぽすと', 'repost (X’s renamed retweet)', '面白かったのでリポストしておいた。', 'It was funny, so I reposted it.', C, '三省堂 今年の新語 2023 (8位)'],
  ['映え', 'ばえ', 'photogenic (インスタ映え); some young people find it dated', 'このパフェ、映えるね。', 'This parfait looks great on camera.', C, 'マイナビニュース'],
  ['おじさん構文', 'おじさんこうぶん', 'emoji-heavy texting style of middle-aged men (mocking)', '部長のLINEがおじさん構文すぎる。', 'The department head’s texts are peak middle-aged-man style.', C, `${S22} (2位, 〇〇構文)`],
  ['闇バイト', 'やみばいと', 'criminal “part-time jobs” recruited on social media', '高額報酬をうたう闇バイトに注意してください。', 'Watch out for criminal “jobs” promising big pay.', null, '三省堂 今年の新語 2023 (10位)'],
  ['スキマバイト', 'すきまばいと', 'app-booked short gig shifts', '空いた時間にスキマバイトをしている。', 'I do short gig shifts in my free time.', null, `${S24} (5位)`],
  ['オールドメディア', 'おーるどめでぃあ', 'legacy media (often pejorative)', 'オールドメディアは信用できないと言う人もいる。', 'Some people say you can’t trust the legacy media.', null, `${S25} (2位); 新語・流行語大賞 2025`],
];

const PEOPLE: PackRow[] = [
  ['蛙化現象', 'かえるかげんしょう', 'suddenly being turned off by someone you liked', '彼の食べ方を見て蛙化現象が起きた。', 'Seeing how he eats instantly killed my crush.', C, 'JC・JK流行語大賞 2023 (上半期1位); 新語・流行語大賞 2023 トップ10'],
  ['陽キャ', 'ようきゃ', 'outgoing, sociable type', 'クラスの陽キャたちがパーティーを企画している。', 'The outgoing kids in class are planning a party.', C, '現代ビジネス'],
  ['陰キャ', 'いんきゃ', 'introverted, awkward type (now in 三省堂国語辞典)', '僕は陰キャなので、大人数の飲み会は苦手です。', 'I’m an introvert, so big drinking parties aren’t my thing.', C, '現代ビジネス'],
  ['親ガチャ', 'おやがちゃ', '“parent lottery”: you can’t choose the parents you get', '親ガチャという言葉に違和感を覚える人もいる。', 'Some people are uneasy with the phrase “parent lottery”.', C, '新語・流行語大賞 2021 トップ10; 大辞泉 新語大賞 2021'],
  ['Z世代', 'ぜっとせだい', 'Generation Z', 'Z世代向けの商品が増えている。', 'Products aimed at Gen Z are increasing.', null, '新語・流行語大賞 2021 トップ10'],
  ['地雷系', 'じらいけい', '“landmine” look: dark, frilly fashion (also implies volatile)', '地雷系メイクが若い女性に人気だ。', 'Landmine-style makeup is popular with young women.', C, 'FUN! JAPAN 解説'],
  ['量産型', 'りょうさんがた', 'cookie-cutter girly style (idol-fan fashion)', '量産型ファッションでライブに行く。', 'I’m going to the concert in the classic fan-girl look.', C, 'FUN! JAPAN 解説'],
  ['闇落ち', 'やみおち', 'turning to the dark side', '主人公が闇落ちする展開に驚いた。', 'I was surprised when the hero turned to the dark side.', C, `${S22} (9位)`],
  ['マウント', 'まうんと', 'one-upmanship (マウントを取る = to one-up)', '学歴でマウントを取ってくる人が苦手だ。', 'I can’t stand people who show off about where they studied.', C, 'マイナビニュース'],
  ['ソフト老害', 'そふとろうがい', 'mid-career people who unwittingly stifle juniors', '自分がソフト老害になっていないか心配だ。', 'I worry I’ve become one of those people who hold the juniors back.', C, '新語・流行語大賞 2024 候補'],
  ['冷笑系', 'れいしょうけい', 'sneering cynics who mock effort', '何にでも冷めたコメントをする冷笑系の人がいる。', 'Some people sneer at everything with cynical comments.', C, 'JC・JK流行語大賞 2026 上半期 (3位)'],
  ['ガチ勢', 'がちぜい', 'hardcore fans or players (vs にわか, casuals)', 'このゲームのガチ勢は毎日十時間やっている。', 'The hardcore players of this game put in ten hours a day.', C, ''],
  ['メンヘラ', 'めんへら', 'emotionally unstable (derogatory; can offend)', '自分のことをメンヘラだと冗談で言う人もいる。', 'Some people jokingly call themselves emotionally unstable.', C, ''],
];

const PATTERNS: PackRow[] = [
  ['しか勝たん', 'しかかたん', 'nothing beats X (推ししか勝たん)', 'やっぱり地元のラーメンしか勝たん。', 'Nothing beats my hometown ramen.', C, 'JC・JK流行語大賞 2020 (上半期1位)'],
  ['わかりみ', 'わかりみ', 'so relatable (〜み turns words into nouns)', 'その気持ち、わかりみが深い。', 'I totally get that feeling.', C, 'Oggi 解説'],
  ['鬼', 'おに', 'super-, crazy (鬼かわいい, 鬼むず)', '今日の試験、鬼むずかった。', 'Today’s exam was crazy hard.', C, '山口大学 論文'],
  ['爆速', 'ばくそく', 'blazing fast (爆〜 = massively: 爆睡, 爆上がり)', '新しいパソコン、爆速でびっくりした。', 'My new computer is blazing fast; I was amazed.', C, ''],
  ['ガチ', 'がち', 'seriously; for real (ガチで)', 'ガチで疲れたから今日は早く寝る。', 'I’m seriously exhausted, so I’m going to bed early.', C, 'Coto Academy 解説'],
  ['一生', 'いっしょう', 'for ages, endlessly (hyperbole: 一生寝てた)', '休みの日は一生寝てた。', 'On my day off I slept forever.', C, `${S22} (7位)`],
  ['界隈', 'かいわい', 'the X crowd (風呂キャンセル界隈)', '私はカフェ巡り界隈の人間です。', 'I’m one of the café-hopping crowd.', C, 'JC・JK流行語大賞 2024 (上半期1位); 新語・流行語大賞 2024'],
  ['知らんけど', 'しらんけど', '“…but don’t quote me” (Kansai origin)', 'あの店、明日休みらしいよ。知らんけど。', 'That shop’s closed tomorrow, apparently. Don’t quote me.', C, '新語・流行語大賞 2022 トップ10'],
  ['ビジュいい', 'びじゅいい', '“looking good” (ビジュいいじゃん)', '今日の髪型、ビジュいいじゃん。', 'Your hair looks great today.', C, '新語・流行語大賞 2025 候補'],
  ['マジ', 'まじ', 'really; seriously (マジで)', 'マジでその話、本当？', 'Seriously, is that story true?', C, ''],
  ['やばい', 'やばい', 'awful, or amazing (context decides)', 'このケーキ、やばいくらい美味しい。', 'This cake is insanely good.', C, ''],
];

/** Dated or cringe now: recognise them, use them only ironically. */
const DATED: PackRow[] = [
  ['ぴえん', 'ぴえん', '(sniff) mildly sad; dated, ironic now', '財布忘れた、ぴえん。', 'Forgot my wallet. Sniff.', C, '三省堂 今年の新語 2020 (大賞)'],
  ['きゅんです', 'きゅんです', '“that gives me butterflies”; 2020 hit, dated', 'その優しさ、きゅんです。', 'That kindness gives me butterflies.', C, 'JC・JK流行語大賞 2020 (1位)'],
  ['あざまる水産', 'あざまるすいさん', 'thanks (joke form); dated and cringe now', 'ノート貸してくれてあざまる水産！', 'Thanks a bunch for lending me your notes!', C, 'Precious 解説'],
  ['かわちい', 'かわちい', 'cute (babyish 可愛い); past its peak', 'この子犬、かわちい。', 'This puppy is so cute.', C, '三省堂 今年の新語 2023 (3位)'],
  ['パリピ', 'ぱりぴ', 'party person; dated', '彼は週末になるとパリピになる。', 'On weekends he turns into a party animal.', C, ''],
];

export const SLANG = interleave([
  ['気持ち・反応', FEELINGS],
  ['略語', SHORT],
  ['推し活', FANDOM],
  ['SNS・ネット', ONLINE],
  ['人・関係', PEOPLE],
  ['言い方・強調', PATTERNS],
  ['死語ぎみ', DATED],
]);
