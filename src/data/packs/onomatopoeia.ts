/**
 * Starter deck: 擬音語・擬態語 grouped by the situation they come up in.
 * Machine-written and NOT checked by a native speaker; every card is tagged
 * seed-unverified. Meanings note the usual pattern: 〜と (adverb),
 * 〜する (verb), 〜の / 〜だ (adjective-like).
 * Convention: sounds in katakana, states and manners in hiragana.
 */
import { interleave, type PackRow } from './common';

const WEATHER: PackRow[] = [
  ['ざあざあ', 'ざあざあ', '(rain) pouring down hard', '朝から雨がざあざあ降っている。', 'It’s been pouring since morning.', null, ''],
  ['しとしと', 'しとしと', '(rain) falling softly and steadily', '梅雨の雨がしとしと降り続いている。', 'The rainy-season rain keeps falling softly.', null, ''],
  ['ぽつぽつ', 'ぽつぽつ', 'in scattered drops; here and there (rain starting)', '雨がぽつぽつ降り出した。', 'It’s started to spit with rain.', null, ''],
  ['じめじめ', 'じめじめ', 'damp and humid (unpleasant); 〜する', '梅雨は部屋がじめじめして嫌だ。', 'I hate how damp the room gets in the rainy season.', null, ''],
  ['むしむし', 'むしむし', 'muggy, sticky-hot; 〜する', '今日はむしむしして寝苦しい。', 'It’s so muggy today it’s hard to sleep.', null, ''],
  ['からっと', 'からっと', 'dry and crisp (weather); also cheerful, frank', '今日はからっと晴れて気持ちがいい。', 'It’s a crisp, clear day and it feels great.', null, ''],
  ['ぽかぽか', 'ぽかぽか', 'pleasantly warm (sun, body); 〜する', '日差しがぽかぽかして眠くなる。', 'The warm sunshine is making me sleepy.', null, ''],
  ['ひんやり', 'ひんやり', 'pleasantly cool to the touch; 〜する', '朝の空気がひんやりしている。', 'The morning air is nice and cool.', null, ''],
  ['じりじり', 'じりじり', '(sun) scorching; also inching closer, slowly', '真夏の太陽がじりじり照りつける。', 'The midsummer sun is scorching down.', null, ''],
  ['びゅうびゅう', 'びゅうびゅう', '(wind) howling', '一晩中、風がびゅうびゅう吹いていた。', 'The wind howled all night.', null, ''],
  ['ゴロゴロ', 'ごろごろ', '(thunder) rumbling; see also ごろごろ, lazing about', '遠くで雷がゴロゴロ鳴っている。', 'Thunder is rumbling in the distance.', null, ''],
  ['しんしん', 'しんしん', '(snow) falling silently; (cold) piercing', '夜の町に雪がしんしんと降っている。', 'Snow is falling silently on the town at night.', null, ''],
];

const FOOD: PackRow[] = [
  ['さくさく', 'さくさく', 'light and crisp (tempura, pastry); also smoothly, quickly', 'この天ぷらは衣がさくさくだ。', 'The batter on this tempura is light and crispy.', null, ''],
  ['ぱりぱり', 'ぱりぱり', 'crackly-crisp (crackers, nori, fresh lettuce)', '焼きたての海苔はぱりぱりしている。', 'Freshly toasted nori is crackly-crisp.', null, ''],
  ['カリカリ', 'かりかり', 'crunchy, hard-crisp (bacon, fried skin); also irritable', 'ベーコンをカリカリに焼いた。', 'I fried the bacon until it was crunchy.', null, ''],
  ['もちもち', 'もちもち', 'chewy and springy (mochi, good bread, noodles)', 'このパンはもちもちしていて美味しい。', 'This bread is nice and chewy.', null, ''],
  ['ふわふわ', 'ふわふわ', 'fluffy, airy (pancakes, omelette); also floaty', 'ふわふわのパンケーキが食べたい。', 'I want some fluffy pancakes.', null, ''],
  ['とろとろ', 'とろとろ', 'melty, gooey, thick (cheese, slow-cooked meat, egg)', 'チーズがとろとろに溶けている。', 'The cheese has melted all gooey.', null, ''],
  ['ぷるぷる', 'ぷるぷる', 'jiggly, wobbly (jelly, pudding); also trembling', 'ぷるぷるのプリンを作った。', 'I made a wobbly pudding.', null, ''],
  ['しっとり', 'しっとり', 'moist (cake, skin); also calm and graceful', 'このケーキはしっとりしている。', 'This cake is lovely and moist.', null, ''],
  ['ほくほく', 'ほくほく', 'soft, floury and hot (baked potato, chestnut); also delighted', 'ほくほくの焼き芋を買った。', 'I bought a hot, floury roasted sweet potato.', null, ''],
  ['しゃきしゃき', 'しゃきしゃき', 'crisp and fresh (vegetables); also brisk', 'しゃきしゃきのレタスでサラダを作る。', 'I’ll make a salad with crisp lettuce.', null, ''],
  ['ねばねば', 'ねばねば', 'sticky, stringy (natto, okra); 〜する', '納豆のねばねばが苦手だ。', 'I can’t stand the stringiness of natto.', null, ''],
  ['あつあつ', 'あつあつ', 'piping hot (also: lovey-dovey couple)', 'あつあつのラーメンをすする。', 'I slurp the piping-hot ramen.', null, ''],
  ['ぐつぐつ', 'ぐつぐつ', 'simmering, bubbling (a pot)', '鍋がぐつぐつ煮えてきた。', 'The pot has come to a simmer.', null, ''],
  ['ジュージュー', 'じゅーじゅー', 'sizzling (on a griddle or pan)', '鉄板の上で肉がジュージュー焼けている。', 'The meat is sizzling on the hot plate.', null, ''],
  ['ごくごく', 'ごくごく', 'gulping down (a drink)', '喉が渇いて水をごくごく飲んだ。', 'I was thirsty and gulped down some water.', null, ''],
  ['がつがつ', 'がつがつ', 'wolfing food down; also greedy, pushy', 'お腹が空いていたので、がつがつ食べた。', 'I was starving, so I wolfed it down.', null, ''],
  ['ぺこぺこ', 'ぺこぺこ', 'starving (お腹がぺこぺこ); also bowing repeatedly', '朝から何も食べていないので、お腹がぺこぺこだ。', 'I haven’t eaten since morning, so I’m starving.', null, ''],
];

const BODY: PackRow[] = [
  ['ずきずき', 'ずきずき', 'throbbing pain (tooth, wound, head); 〜する', '虫歯がずきずき痛む。', 'My bad tooth is throbbing.', null, ''],
  ['がんがん', 'がんがん', 'pounding (headache); also loudly, full blast', '二日酔いで頭ががんがんする。', 'I’ve got a pounding hangover headache.', null, ''],
  ['ちくちく', 'ちくちく', 'prickling, scratchy (wool, needles); also nagging remarks', 'このセーターは首がちくちくする。', 'This sweater is scratchy around the neck.', null, ''],
  ['ひりひり', 'ひりひり', 'stinging, smarting (sunburn, spicy food)', '日焼けして背中がひりひりする。', 'My back stings from sunburn.', null, ''],
  ['きりきり', 'きりきり', 'sharp, stabbing pain (stomach from stress)', 'ストレスで胃がきりきり痛む。', 'My stomach is stabbing with pain from stress.', null, ''],
  ['むかむか', 'むかむか', 'nauseous; also seething with anger', '車に酔って胸がむかむかする。', 'I’m carsick and feel queasy.', null, ''],
  ['ぞくぞく', 'ぞくぞく', 'shivery (chills); also thrilled', '熱があるのか、背中がぞくぞくする。', 'Maybe I have a fever; I’ve got shivers down my back.', null, ''],
  ['ふらふら', 'ふらふら', 'dizzy, unsteady on your feet; also aimlessly', '徹夜したので、ふらふらする。', 'I stayed up all night, so I’m unsteady on my feet.', null, ''],
  ['くたくた', 'くたくた', 'dead tired; also limp, worn (clothes)', '一日中歩いて、くたくただ。', 'I walked all day and I’m dead tired.', null, ''],
  ['へとへと', 'へとへと', 'completely worn out', '引っ越しの片付けでへとへとになった。', 'Unpacking after the move wore me out.', null, ''],
  ['ぐっすり', 'ぐっすり', '(sleep) soundly, deeply', '昨夜はぐっすり眠れた。', 'I slept like a log last night.', null, ''],
  ['うとうと', 'うとうと', 'dozing off; 〜する', '会議中についうとうとしてしまった。', 'I accidentally nodded off during the meeting.', null, ''],
  ['むずむず', 'むずむず', 'itchy, tickly (nose); also itching to do something', '花粉で鼻がむずむずする。', 'Pollen is making my nose tickle.', null, ''],
  ['がらがら', 'がらがら', 'hoarse (voice); also empty (train); gargling', 'カラオケで歌いすぎて、声ががらがらだ。', 'I sang too much at karaoke and my voice is hoarse.', null, ''],
];

const FEELINGS: PackRow[] = [
  ['どきどき', 'どきどき', 'heart pounding: nervous or excited; 〜する', '発表の前はいつもどきどきする。', 'My heart always pounds before a presentation.', null, ''],
  ['わくわく', 'わくわく', 'excited, looking forward to something', '明日からの旅行にわくわくしている。', 'I’m excited about the trip that starts tomorrow.', null, ''],
  ['いらいら', 'いらいら', 'irritated, on edge; 〜する', '電車が遅れていらいらした。', 'The train was late and it got on my nerves.', null, ''],
  ['もやもや', 'もやもや', 'vague, unresolved unease you can’t pin down', '話し合いの結果にもやもやが残った。', 'I came away from the discussion with a nagging sense of unease.', null, ''],
  ['はらはら', 'はらはら', 'on tenterhooks (watching someone, worried)', '子どもが木に登るのをはらはらしながら見ていた。', 'I watched on tenterhooks as the child climbed the tree.', null, ''],
  ['ひやひや', 'ひやひや', 'nervous, scared something will go wrong (for yourself)', '締め切りに間に合うか、ひやひやした。', 'I was nervous about whether I’d make the deadline.', null, ''],
  ['うきうき', 'うきうき', 'cheerful, buoyant; 〜する', '給料日なので、うきうきしている。', 'It’s payday, so I’m in high spirits.', null, ''],
  ['しょんぼり', 'しょんぼり', 'dejected, crestfallen; 〜する', '試合に負けて、息子はしょんぼりしていた。', 'My son was crestfallen after losing the match.', null, ''],
  ['がっかり', 'がっかり', 'disappointed; 〜する', '楽しみにしていたイベントが中止になって、がっかりした。', 'I was disappointed that the event I’d looked forward to was cancelled.', null, ''],
  ['ほっと', 'ほっと', 'relieved; 〜する', '検査の結果が問題なくて、ほっとした。', 'I was relieved the test results were fine.', null, ''],
  ['すっきり', 'すっきり', 'refreshed, cleared up; also neat and uncluttered', '部屋を片付けたら、気分がすっきりした。', 'Tidying my room left me feeling refreshed.', null, ''],
  ['むっと', 'むっと', 'offended, miffed (shows on the face); also stuffy air', '失礼なことを言われて、むっとした。', 'Someone said something rude and I was miffed.', null, ''],
  ['びくびく', 'びくびく', 'timid, jumpy, afraid; 〜する', '怒られるのではないかと、びくびくしていた。', 'I was jumpy, afraid I’d get told off.', null, ''],
  ['おろおろ', 'おろおろ', 'flustered, not knowing what to do', '突然のトラブルに、新人はおろおろするばかりだった。', 'Faced with the sudden trouble, the new hire was completely flustered.', null, ''],
];

const MANNER: PackRow[] = [
  ['にこにこ', 'にこにこ', 'smiling warmly; 〜する', '受付の人がにこにこしながら案内してくれた。', 'The receptionist showed me the way with a warm smile.', null, ''],
  ['にやにや', 'にやにや', 'smirking, grinning to yourself (often suspicious)', '何かいいことがあったのか、彼はにやにやしている。', 'He’s grinning to himself; something good must have happened.', null, ''],
  ['くすくす', 'くすくす', 'giggling, chuckling quietly', '後ろの席から、くすくす笑う声が聞こえた。', 'I heard giggling from the seats behind me.', null, ''],
  ['げらげら', 'げらげら', 'guffawing, laughing loudly', '漫才を見て、げらげら笑った。', 'I roared with laughter at the comedy act.', null, ''],
  ['じろじろ', 'じろじろ', 'staring rudely', '人の顔をじろじろ見ないで。', 'Don’t stare at people like that.', null, ''],
  ['きょろきょろ', 'きょろきょろ', 'looking around restlessly (lost, curious)', '駅で道に迷って、きょろきょろしていた。', 'I got lost at the station and was looking all around.', null, ''],
  ['ぼーっと', 'ぼーっと', 'spacing out, absent-minded; 〜する', '疲れていて、一日中ぼーっとしていた。', 'I was tired and spaced out all day.', null, ''],
  ['ぺらぺら', 'ぺらぺら', 'fluent; also chattering on, blabbing', '彼女は英語も中国語もぺらぺらだ。', 'She’s fluent in both English and Chinese.', null, ''],
  ['ぶつぶつ', 'ぶつぶつ', 'muttering, grumbling; also bumps or a rash', '部長は何かぶつぶつ文句を言っている。', 'The department head is grumbling about something.', null, ''],
  ['ひそひそ', 'ひそひそ', 'whispering (secretively)', '二人は廊下でひそひそ話していた。', 'The two were whispering in the corridor.', null, ''],
  ['もじもじ', 'もじもじ', 'fidgeting shyly, hesitating', '子どもは恥ずかしそうにもじもじしていた。', 'The child was fidgeting shyly.', null, ''],
  ['ぐずぐず', 'ぐずぐず', 'dawdling, dithering; also a sniffly nose', 'ぐずぐずしていると遅刻するよ。', 'If you dawdle, you’ll be late.', null, ''],
  ['てきぱき', 'てきぱき', 'briskly and efficiently', '彼女は仕事をてきぱきと片付ける。', 'She gets through her work briskly and efficiently.', null, ''],
  ['のんびり', 'のんびり', 'leisurely, relaxed; 〜する', '週末は温泉でのんびりした。', 'I relaxed at a hot spring over the weekend.', null, ''],
];

const WORK: PackRow[] = [
  ['ばたばた', 'ばたばた', 'hectic, rushing about; 〜する', '月末はばたばたしているので、来月にしてもらえますか。', 'The end of the month is hectic; could we do it next month?', null, ''],
  ['ぎりぎり', 'ぎりぎり', 'only just; at the last moment', '締め切りぎりぎりに提出した。', 'I handed it in right at the deadline.', null, ''],
  ['ぎっしり', 'ぎっしり', 'packed full (schedule, box)', '今週は予定がぎっしり詰まっている。', 'My schedule is packed this week.', null, ''],
  ['こつこつ', 'こつこつ', 'steadily, little by little (effort)', '毎日こつこつ勉強を続けている。', 'I keep studying steadily every day.', null, ''],
  ['さくっと', 'さくっと', 'quickly and easily, without fuss (casual)', 'この件はさくっと終わらせましょう。', 'Let’s get this one done quickly.', 'casual', ''],
  ['ぴりぴり', 'ぴりぴり', 'tense, on edge (atmosphere); also tingling, spicy', '決算前でオフィスがぴりぴりしている。', 'The office is tense ahead of the financial results.', null, ''],
  ['だらだら', 'だらだら', 'dragging on, idly; also dripping (sweat)', '会議がだらだら長引いた。', 'The meeting dragged on and on.', null, ''],
  ['ぐだぐだ', 'ぐだぐだ', 'sloppy, aimless, falling apart (casual)', '準備不足で、発表がぐだぐだになった。', 'We hadn’t prepared, so the presentation was a shambles.', 'casual', ''],
  ['すらすら', 'すらすら', 'smoothly, fluently, without hesitation', '質問にすらすら答えられた。', 'I was able to answer the questions smoothly.', null, ''],
  ['もたもた', 'もたもた', 'slow and clumsy, fumbling; 〜する', 'レジでもたもたして、後ろの人を待たせてしまった。', 'I fumbled at the till and kept the people behind me waiting.', null, ''],
  ['ちらっと', 'ちらっと', 'a quick glance; mentioning briefly', '会議で新しい企画のことをちらっと話した。', 'I briefly mentioned the new project at the meeting.', null, ''],
  ['ばっちり', 'ばっちり', 'perfectly; all set', '準備はばっちりです。', 'Everything’s all set.', null, ''],
  ['きっちり', 'きっちり', 'exactly, precisely; neatly', '会議は10時きっちりに始まった。', 'The meeting started at exactly 10.', null, ''],
  ['どんどん', 'どんどん', 'rapidly, more and more; also go right ahead', '質問があれば、どんどん聞いてください。', 'If you have questions, go right ahead and ask.', null, ''],
];

const HOME: PackRow[] = [
  ['ぴかぴか', 'ぴかぴか', 'sparkling clean, shiny; also brand-new', '床をぴかぴかに磨いた。', 'I polished the floor until it sparkled.', null, ''],
  ['つるつる', 'つるつる', 'smooth, slippery (ice, skin); also slurping noodles', '道が凍ってつるつるしている。', 'The road is icy and slippery.', null, ''],
  ['ざらざら', 'ざらざら', 'rough, gritty to the touch', 'テーブルが砂でざらざらしている。', 'The table is gritty with sand.', null, ''],
  ['べたべた', 'べたべた', 'sticky; also clingy (people)', 'ジュースをこぼして、手がべたべたになった。', 'I spilled juice and my hands got sticky.', null, ''],
  ['ぬるぬる', 'ぬるぬる', 'slimy, slippery (soap, fish)', '石が苔でぬるぬるしている。', 'The rocks are slimy with moss.', null, ''],
  ['ふかふか', 'ふかふか', 'soft and plump (futon, sofa)', '干した布団がふかふかで気持ちいい。', 'The aired futon is soft and lovely.', null, ''],
  ['ごちゃごちゃ', 'ごちゃごちゃ', 'cluttered, jumbled; also complaining', '引き出しの中がごちゃごちゃだ。', 'The inside of the drawer is a jumble.', null, ''],
  ['ぼろぼろ', 'ぼろぼろ', 'falling apart, worn out (things or people)', '十年使った財布がぼろぼろになった。', 'The wallet I’ve used for ten years is falling apart.', null, ''],
  ['しわしわ', 'しわしわ', 'wrinkled, creased', 'シャツがしわしわなので、アイロンをかけよう。', 'My shirt is all creased, so I’ll iron it.', null, ''],
  ['ぐちゃぐちゃ', 'ぐちゃぐちゃ', 'a mess; squashed, jumbled', '雨で書類がぐちゃぐちゃになった。', 'The rain turned the documents into a soggy mess.', null, ''],
  ['ぴったり', 'ぴったり', 'a perfect fit; exactly', 'この靴はサイズがぴったりだ。', 'These shoes are a perfect fit.', null, ''],
  ['ごろごろ', 'ごろごろ', 'lazing around (at home); also rolling, plenty of', '休みの日は家でごろごろしている。', 'On my days off I laze around at home.', null, ''],
];

const SOUNDS: PackRow[] = [
  ['ピンポン', 'ぴんぽん', 'ding-dong (doorbell); ピンポーン also “correct!”', 'ピンポンとチャイムが鳴った。', 'The doorbell went ding-dong.', null, ''],
  ['トントン', 'とんとん', 'knock-knock; tap-tap (chopping, shoulder); also even (break-even)', 'ドアをトントンと叩く音がした。', 'There was a knock-knock at the door.', null, ''],
  ['ガチャ', 'がちゃ', 'click, clunk (a door handle, lock, phone hung up)', 'ドアがガチャッと開いた。', 'The door opened with a clunk.', null, ''],
  ['ガタガタ', 'がたがた', 'rattling; also shivering; also in shambles', '風で窓がガタガタ鳴っている。', 'The windows are rattling in the wind.', null, ''],
  ['ブーブー', 'ぶーぶー', 'buzzing (phone on vibrate); also grumbling', 'ポケットの中でスマホがブーブー鳴っている。', 'My phone is buzzing in my pocket.', null, ''],
  ['カチカチ', 'かちかち', 'clicking, ticking; also frozen hard', '時計のカチカチという音が気になる。', 'The ticking of the clock is bothering me.', null, ''],
  ['パチパチ', 'ぱちぱち', 'clapping; crackling (fire); blinking', '発表が終わると、パチパチと拍手が起きた。', 'When the presentation ended, people clapped.', null, ''],
  ['ドンドン', 'どんどん', 'banging, pounding (on a door, drums)', '隣の部屋から壁をドンドン叩く音がする。', 'Someone is banging on the wall from next door.', null, ''],
  ['チーン', 'ちーん', 'ding (microwave, bell)', '電子レンジがチーンと鳴った。', 'The microwave went ding.', null, ''],
  ['ザワザワ', 'ざわざわ', 'murmur of a crowd; also uneasy (heart)', '発表の瞬間、会場がザワザワした。', 'The moment it was announced, a murmur ran through the hall.', null, ''],
  ['シーン', 'しーん', 'dead silence (written as a “sound”)', '冗談を言ったら、会議室がシーンとなった。', 'When I told a joke, the meeting room went dead silent.', null, ''],
];

const MOVE: PackRow[] = [
  ['すたすた', 'すたすた', 'walking briskly, without looking back', '彼は挨拶もせずにすたすた歩いて行った。', 'He walked briskly off without even saying goodbye.', null, ''],
  ['とぼとぼ', 'とぼとぼ', 'trudging, plodding along (tired, dejected)', '試合に負けて、とぼとぼ家に帰った。', 'After losing the match, I trudged home.', null, ''],
  ['ぶらぶら', 'ぶらぶら', 'strolling aimlessly; also idling; dangling', '休日に駅前をぶらぶらした。', 'On my day off I strolled around near the station.', null, ''],
  ['うろうろ', 'うろうろ', 'wandering about, hanging around (aimless, lost)', '店の前を怪しい男がうろうろしている。', 'A suspicious man is hanging around in front of the shop.', null, ''],
  ['ぐるぐる', 'ぐるぐる', 'round and round; also wrapped around', '同じ考えが頭の中をぐるぐる回っている。', 'The same thought keeps going round and round in my head.', null, ''],
  ['ころころ', 'ころころ', 'rolling; also changing often (plans, opinions)', '彼は言うことがころころ変わる。', 'What he says keeps changing.', null, ''],
  ['ばったり', 'ばったり', 'bumping into someone by chance; also falling flat', '駅で昔の同僚にばったり会った。', 'I ran into a former colleague at the station.', null, ''],
  ['ぞろぞろ', 'ぞろぞろ', 'in a long stream, in droves', '試合が終わって、観客がぞろぞろと出てきた。', 'When the game ended, the spectators streamed out.', null, ''],
  ['よちよち', 'よちよち', 'toddling (a small child’s first steps)', '赤ちゃんがよちよち歩き始めた。', 'The baby has started to toddle.', null, ''],
];

export const ONOMATOPOEIA = interleave([
  ['天気', WEATHER],
  ['食べ物', FOOD],
  ['体調', BODY],
  ['気持ち', FEELINGS],
  ['人の様子', MANNER],
  ['仕事', WORK],
  ['家・物', HOME],
  ['音', SOUNDS],
  ['動き', MOVE],
]);
