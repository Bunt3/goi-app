/**
 * Starter deck: office slang, jargon and shorthand that native office
 * workers use and textbooks skip. Machine-written and NOT checked by a
 * native speaker; every card is tagged seed-unverified. The source column
 * names where a term's meaning was found documented (search excerpts,
 * 2026-11); '' means it was not checked against a source.
 * Words already in the Workplace seed deck (叩き台, 根回し, 前倒し …) are left out.
 */
import { interleave, type PackRow } from './common';

const C = 'casual' as const;

const SHORT: PackRow[] = [
  ['なるはや', 'なるはや', 'ASAP (short for なるべく早く); casual, avoid with clients', 'この資料、なるはやでお願いできる？', 'Could you get me this document ASAP?', C, 'DIME'],
  ['リスケ', 'りすけ', 'to reschedule (from リスケジュール); casual, say 日程変更 to clients', '先方の都合で、来週の打ち合わせはリスケになりました。', 'The client asked to reschedule next week’s meeting.', C, 'All About ビジネス用語'],
  ['あいみつ', 'あいみつ', 'competing quotes from several vendors (相見積もり)', '念のため、三社からあいみつを取っておいてください。', 'To be safe, get competing quotes from three companies.', null, 'All About; カオナビ用語辞典'],
  ['NR', 'えぬあーる', 'going home straight from an outside appointment (“no return”; whiteboard shorthand)', 'ホワイトボードに「15時 A社訪問、NR」と書いておいた。', 'I wrote “3 pm visiting Company A, NR” on the whiteboard.', null, 'All About'],
  ['直行直帰', 'ちょっこうちょっき', 'going to and from outside appointments without coming into the office', '明日は客先に直行直帰します。', 'Tomorrow I’ll go straight to the client and home from there.', null, 'All About'],
  ['キャパオーバー', 'きゃぱおーばー', 'over capacity; swamped', '今月は案件が重なって、完全にキャパオーバーです。', 'This month the projects piled up and I’m completely swamped.', C, 'DIME'],
  ['MTG', 'みーてぃんぐ', 'meeting (written shorthand in calendars and chat)', '14時から社内MTGが入っています。', 'I have an internal meeting from 2 pm.', null, 'All About'],
  ['TBD', 'てぃーびーでぃー', 'to be determined (schedules, documents)', '会場はまだTBDです。', 'The venue is still TBD.', null, 'All About'],
  ['アポ', 'あぽ', 'appointment (usually with a client)', '来週、新規のお客様とアポが取れました。', 'I got an appointment with a new customer next week.', null, ''],
  ['ブレスト', 'ぶれすと', 'brainstorming (session)', 'まずはブレストでアイデアを出し合いましょう。', 'Let’s start by brainstorming ideas together.', null, ''],
  ['オンスケ', 'おんすけ', 'on schedule', '今のところ、プロジェクトはオンスケです。', 'So far the project is on schedule.', C, ''],
  ['中抜け', 'なかぬけ', 'stepping out during work hours for a personal errand', '病院に行くので、14時から1時間ほど中抜けします。', 'I’m going to the doctor, so I’ll step out for about an hour from 2.', null, 'jinjer; TeamSpirit'],
  ['ノー残', 'のーざん', 'no overtime (ノー残業); ノー残デー = no-overtime day', '水曜日はノー残デーなので、定時で帰ります。', 'Wednesday is a no-overtime day, so I’m leaving on time.', C, ''],
  ['ペライチ', 'ぺらいち', 'a one-page document or summary', '企画の概要をペライチにまとめてもらえる？', 'Could you sum up the plan on a single page?', C, 'マネーポスト'],
];

const KATAKANA: PackRow[] = [
  ['アサイン', 'あさいん', 'to assign (a person to a task or project)', '新しい案件に山田さんをアサインしました。', 'I assigned Yamada to the new project.', null, 'All About'],
  ['ペンディング', 'ぺんでぃんぐ', 'on hold; postponed', 'その件は予算が決まるまでペンディングにしましょう。', 'Let’s put that on hold until the budget is decided.', null, 'All About'],
  ['フィックス', 'ふぃっくす', 'to finalize (a date or spec); no more changes after this', '日程は来週の月曜日でフィックスでお願いします。', 'Let’s lock in next Monday as the date.', null, 'All About'],
  ['バッファ', 'ばっふぁ', 'slack, margin (time, budget, people)', 'スケジュールには二、三日バッファを持たせておこう。', 'Let’s leave two or three days of slack in the schedule.', null, 'カオナビ用語辞典'],
  ['エビデンス', 'えびでんす', 'evidence; proof such as logs, screenshots or records', 'テスト結果のエビデンスとして、スクリーンショットを残してください。', 'Keep screenshots as evidence of the test results.', null, 'マイナビニュース'],
  ['アグリー', 'あぐりー', 'agree; peers only, to a boss say 賛成です', 'その方針には、私もアグリーです。', 'I agree with that approach too.', C, 'All About'],
  ['コミット', 'こみっと', 'to commit to a result and own it (heavier than a promise)', '今期の売上目標には必ずコミットします。', 'I’m committed to hitting this term’s sales target.', null, 'All About'],
  ['マター', 'またー', '(someone’s) responsibility; X’s call (人事マター = HR’s call)', 'その件は人事マターなので、人事部に確認してください。', 'That’s HR’s call, so check with the HR department.', C, 'All About; 創業手帳'],
  ['ジャストアイデア', 'じゃすとあいであ', '“just a thought” (hedge before offering an idea)', 'ジャストアイデアですが、オンラインで開催するのはどうでしょう。', 'Just a thought, but how about holding it online?', C, 'All About'],
  ['ボトルネック', 'ぼとるねっく', 'bottleneck; the thing holding everything up', '承認フローがボトルネックになっている。', 'The approval process has become the bottleneck.', null, '創業手帳'],
  ['ブラッシュアップ', 'ぶらっしゅあっぷ', 'to polish, refine (something that exists)', 'いただいた意見をもとに、企画書をブラッシュアップします。', 'I’ll refine the proposal based on your comments.', null, 'DIME'],
  ['アジェンダ', 'あじぇんだ', 'meeting agenda', '会議の前にアジェンダを共有しておきます。', 'I’ll share the agenda before the meeting.', null, 'Precious'],
  ['マスト', 'ますと', 'a must; mandatory (マストで = without fail)', 'この研修は新入社員はマストで参加です。', 'This training is mandatory for new hires.', C, ''],
  ['イシュー', 'いしゅー', 'the key issue to solve (consultant flavour)', 'まず、本当のイシューが何かを整理しましょう。', 'First, let’s pin down what the real issue is.', null, ''],
  ['ローンチ', 'ろーんち', 'launch (a product or service)', '新サービスは来月ローンチ予定です。', 'The new service is due to launch next month.', null, ''],
  ['ナレッジ', 'なれっじ', 'know-how; shared knowledge', 'トラブル対応のナレッジを共有フォルダにまとめました。', 'I collected our troubleshooting know-how in the shared folder.', null, ''],
  ['キャッチアップ', 'きゃっちあっぷ', 'to catch up on; get up to speed', '休み中の進捗をキャッチアップしておきます。', 'I’ll catch up on what happened while I was off.', null, ''],
  ['ネクストアクション', 'ねくすとあくしょん', 'next steps; action items (end of a meeting)', '最後にネクストアクションを確認しましょう。', 'To finish, let’s confirm the next steps.', null, ''],
  ['工数', 'こうすう', 'man-hours; effort (in estimates)', 'この改修にはどれくらい工数がかかりますか。', 'How many man-hours will this change take?', null, 'All About'],
  ['1on1', 'わんおんわん', 'regular one-on-one meeting with your manager', '毎週金曜に上司と1on1があります。', 'I have a one-on-one with my manager every Friday.', null, 'Mac Fan (マイナビ)'],
];

const IDIOM: PackRow[] = [
  ['握る', 'にぎる', 'to lock in an agreement in advance with a key person', '先方の部長とは、もう握ってあります。', 'I’ve already got the client’s department head on board.', C, 'DIME; Oggi'],
  ['巻き取る', 'まきとる', 'to take over a colleague’s unfinished task (helpfully)', 'その作業、私が巻き取りましょうか。', 'Shall I take that task off your hands?', null, 'DIME'],
  ['後ろ倒し', 'うしろだおし', 'pushing back (a schedule); opposite of 前倒し', 'リリースを一週間後ろ倒しにします。', 'We’ll push the release back a week.', null, 'Oggi'],
  ['一旦', 'いったん', 'for now; tentatively (a meeting verbal tic)', '一旦この方向で進めて、問題があれば見直しましょう。', 'Let’s go this way for now and revisit it if there’s a problem.', null, 'Forbes JAPAN'],
  ['ざっくり', 'ざっくり', 'roughly; ballpark', 'ざっくりでいいので、費用感を教えてください。', 'Just a rough idea is fine; what kind of cost are we looking at?', C, 'Oggi'],
  ['肌感', 'はだかん', 'gut feel from experience (not data)', '肌感としては、来月は受注が増えそうです。', 'My gut feeling is that orders will pick up next month.', C, 'Oggi; DIME'],
  ['温度感', 'おんどかん', 'how keen or urgent someone is about something', '先方の温度感を確認してから提案しましょう。', 'Let’s gauge how keen the client is before we pitch.', null, ''],
  ['解像度が高い', 'かいぞうどがたかい', 'having a sharp, detailed understanding (buzzword)', '彼は顧客の課題に対する解像度が高い。', 'He has a really sharp grasp of the customer’s problems.', null, '東洋経済; ダイヤモンド'],
  ['ふわっと', 'ふわっと', 'vague, fuzzy, lacking specifics', '要件がまだふわっとしているので、もう少し詰めましょう。', 'The requirements are still fuzzy, so let’s nail them down a bit more.', C, '東洋経済'],
  ['腹落ち', 'はらおち', 'being truly convinced; it finally clicks', '説明を聞いて、ようやく腹落ちしました。', 'After hearing the explanation, it finally clicked.', null, 'Schoo'],
  ['認識合わせ', 'にんしきあわせ', 'aligning everyone’s understanding before starting', '着手する前に、一度認識合わせをさせてください。', 'Before we start, let’s make sure we’re all on the same page.', null, 'Forbes JAPAN'],
  ['ボールを持つ', 'ぼーるをもつ', 'to own the next action (“the ball is in your court”)', '今この件のボールを持っているのは誰ですか。', 'Who has the ball on this right now?', C, 'DIME'],
  ['よしなに', 'よしなに', 'as you see fit; handle it appropriately (not keigo)', '細かいところはよしなにお願いします。', 'Please handle the details as you see fit.', C, 'マイナビニュース; マイナビ転職'],
  ['巻きで', 'まきで', 'faster; speed it up (from TV production)', '時間がないので、ここからは巻きでお願いします。', 'We’re short on time, so let’s speed things up from here.', C, ''],
  ['詰める', 'つめる', 'to hammer out (details); also to grill someone', '来週までに仕様を詰めておきます。', 'I’ll have the specs hammered out by next week.', null, ''],
  ['寝かせる', 'ねかせる', 'to let (a plan) sit for a while; sometimes to shelve quietly', 'この企画は一度寝かせて、来月また考えましょう。', 'Let’s let this plan sit and look at it again next month.', null, ''],
  ['刺さる', 'ささる', 'to resonate with (a target audience)', 'このキャッチコピーは若い世代に刺さると思う。', 'I think this tagline will resonate with younger people.', C, ''],
  ['壁打ち', 'かべうち', 'bouncing ideas off someone', '企画の壁打ちに少し付き合ってもらえますか。', 'Could I bounce some ideas for the plan off you?', C, ''],
  ['落とし込む', 'おとしこむ', 'to turn (a plan) into concrete steps', '方針を具体的なタスクに落とし込みます。', 'I’ll break the policy down into concrete tasks.', null, ''],
  ['深掘り', 'ふかぼり', 'digging deeper (into a topic)', 'この数字の原因をもう少し深掘りしましょう。', 'Let’s dig a little deeper into what’s behind this number.', null, ''],
  ['粒度', 'りゅうど', 'level of detail (granularity)', '報告書の粒度を揃えてください。', 'Please make the level of detail consistent across the reports.', null, ''],
];

const CHAT: PackRow[] = [
  ['既読スルー', 'きどくするー', 'reading a message and not replying', '上司に既読スルーされて不安になった。', 'My boss read my message and didn’t reply, and it made me anxious.', C, 'J-CAST'],
  ['ハドル', 'はどる', 'a quick ad-hoc call in Slack (huddle)', 'ちょっとハドルで話せますか。', 'Got a minute for a quick huddle?', C, 'カオナビ用語辞典'],
  ['在宅', 'ざいたく', 'working from home (在宅勤務)', '今日は在宅なので、オンラインで参加します。', 'I’m working from home today, so I’ll join online.', null, 'カオナビ用語辞典'],
  ['フルリモート', 'ふるりもーと', 'fully remote work', '今の会社はフルリモートで、出社は月一回です。', 'My company is fully remote; I go in once a month.', null, ''],
  ['出社回帰', 'しゅっしゃかいき', 'the return-to-office push', 'コロナ後、出社回帰の動きが広がっている。', 'Since COVID, the push to return to the office has been spreading.', null, 'freee (search excerpt)'],
  ['返信不要', 'へんしんふよう', 'no reply needed (to a boss: ご返信には及びません)', '確認のみですので、返信不要です。', 'This is just for your information; no need to reply.', null, ''],
  ['メンション', 'めんしょん', '@-mention (in chat tools)', '急ぎの件はメンションを付けて連絡してください。', 'For urgent matters, contact me with an @-mention.', null, 'J-CAST'],
  ['画面共有', 'がめんきょうゆう', 'screen sharing', '今から画面共有しますね。', 'I’ll share my screen now.', null, ''],
];

const BUZZ: PackRow[] = [
  ['タイパ', 'たいぱ', 'time efficiency (“time performance”); 三省堂 新語 2022 winner', '会議を減らしてタイパを上げたい。', 'I want to cut meetings and get more done per hour.', C, '三省堂 今年の新語 2022 (大賞)'],
  ['リスキリング', 'りすきりんぐ', 'reskilling', '会社の支援でリスキリングに取り組んでいる。', 'I’m reskilling with support from my company.', null, '三省堂 今年の新語 2022; 新語・流行語大賞 2022 候補'],
  ['言語化', 'げんごか', 'putting (an idea or feeling) into words', 'もやもやしている課題を言語化してみましょう。', 'Let’s try putting the problem that’s bugging us into words.', null, '三省堂 今年の新語 2024 (大賞)'],
  ['ハルシネーション', 'はるしねーしょん', 'AI hallucination (confident but false output)', '生成AIの回答にはハルシネーションがあるので、必ず確認してください。', 'Generative AI answers can contain hallucinations, so always check them.', null, '三省堂 今年の新語 2023'],
  ['カスハラ', 'かすはら', 'customer harassment (カスタマーハラスメント)', 'カスハラ対策のマニュアルが作られた。', 'A manual for dealing with customer harassment was drawn up.', null, '新語・流行語大賞 2024 候補'],
  ['フキハラ', 'ふきはら', 'making others uneasy with a bad mood (sighing, tutting, silence)', 'ため息ばかりついていると、フキハラだと言われるよ。', 'If you keep sighing like that, people will call it mood harassment.', C, 'カオナビ用語辞典'],
  ['静かな退職', 'しずかなたいしょく', 'quiet quitting: doing only the minimum required', '最近、静かな退職を選ぶ若手が増えているらしい。', 'Apparently more young staff are choosing to quietly quit.', null, 'DIME; 日本の人事部'],
  ['ゆるブラック', 'ゆるぶらっく', 'a workplace that is easy but offers no growth', '残業はないけど、成長できないゆるブラックな職場だ。', 'There’s no overtime, but it’s a cushy dead-end job.', C, '東洋経済'],
  ['配属ガチャ', 'はいぞくがちゃ', 'the luck of the draw in your team posting', '配属ガチャに外れたと嘆く新人もいる。', 'Some new hires complain they lost the team-posting lottery.', C, 'President; DIME'],
  ['退職代行', 'たいしょくだいこう', 'a paid service that resigns on your behalf', '退職代行を使って辞める新入社員が増えている。', 'More new employees are quitting through resignation services.', null, '東洋経済'],
  ['心理的安全性', 'しんりてきあんぜんせい', 'psychological safety (HR buzzword)', '心理的安全性の高いチームは、意見が出やすい。', 'Teams with high psychological safety find it easier to speak up.', null, 'カオナビ用語辞典'],
  ['意識高い系', 'いしきたかいけい', 'try-hard; showy about ambition (often heavy on katakana jargon)', 'カタカナ語ばかり使うと、意識高い系だと思われるよ。', 'Use nothing but katakana words and people will think you’re a try-hard.', C, ''],
  ['ガクチカ', 'がくちか', '“what you put effort into as a student” (job-interview staple)', '面接でガクチカを聞かれた。', 'They asked me what I focused on as a student in the interview.', C, '三省堂 今年の新語 2022'],
];

/** Heard from older managers; good to recognise, risky to use. */
const OLDER: PackRow[] = [
  ['ケツカッチン', 'けつかっちん', 'a hard stop: the next commitment is right after (vulgar-ish, TV origin)', '16時でケツカッチンなので、それまでに終わらせましょう。', 'I have a hard stop at 4, so let’s finish before then.', C, 'DIME'],
  ['ガラガラポン', 'がらがらぽん', 'scrapping everything and starting over', '計画を一度ガラガラポンして考え直そう。', 'Let’s scrap the plan and rethink it from scratch.', C, '創業手帳; マネーポスト'],
  ['正直ベース', 'しょうじきべーす', 'frankly speaking', '正直ベースで言うと、この予算では厳しいです。', 'Frankly, it’s going to be tough on this budget.', C, '神戸新聞「おっさんビジネス用語」'],
  ['一丁目一番地', 'いっちょうめいちばんち', 'top priority', '顧客満足度の向上が我が社の一丁目一番地だ。', 'Raising customer satisfaction is our company’s top priority.', null, 'マネーポスト'],
];

export const OFFICE = interleave([
  ['略語', SHORT],
  ['カタカナ語', KATAKANA],
  ['職場の言い回し', IDIOM],
  ['チャット・リモート', CHAT],
  ['新語', BUZZ],
  ['年配の上司', OLDER],
]);
