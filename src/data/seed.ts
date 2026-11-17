import type { Register } from '../types';

/**
 * Seed deck: workplace words and set phrases, roughly N1 and above.
 *
 * NOT VERIFIED by a native speaker or checked against a dictionary. Every
 * card is tagged `seed-unverified` when loaded. Example sentences were
 * written so that each contains the target word (or its stem), which is what
 * the highlighting and fill-in-the-blank display rely on.
 */
export interface SeedEntry {
  word: string;
  reading: string;
  meaning_en: string;
  example_ja: string;
  example_en: string;
  tags: string[];
  register: Register | null;
}

const K: Register = '謙譲語';
const S: Register = '尊敬語';
const P: Register = 'polite';
const W: Register = 'written-only';
type Row = [word: string, reading: string, meaning: string, exampleJa: string, exampleEn: string, register: Register | null];

const PHONE: Row[] = [
  ['承る', 'うけたまわる', 'to take / receive (an order, message, request) — humble', 'ご伝言を承ります。', 'I will take your message.', K],
  ['取り次ぐ', 'とりつぐ', 'to put a call through; to relay to the right person', '担当の者に取り次ぎますので、少々お待ちください。', 'I will put you through to the person in charge; one moment, please.', P],
  ['折り返し', 'おりかえし', 'calling back; by return', '戻り次第、折り返しお電話いたします。', 'I will call you back as soon as they return.', P],
  ['席を外す', 'せきをはずす', 'to be away from one’s desk', '田中はただいま席を外しております。', 'Tanaka is away from his desk at the moment.', P],
  ['あいにく', 'あいにく', 'unfortunately (softening bad news)', 'あいにく鈴木は外出しております。', 'Unfortunately, Suzuki is out of the office.', P],
  ['差し支えなければ', 'さしつかえなければ', 'if it is not a problem; if you don’t mind', '差し支えなければ、ご用件をお聞かせいただけますか。', 'If you don’t mind, may I ask what this is regarding?', P],
  ['恐れ入りますが', 'おそれいりますが', 'I’m sorry to trouble you, but…', '恐れ入りますが、もう一度お名前をお願いできますか。', 'I’m sorry, but could I have your name once more?', P],
  ['申し伝える', 'もうしつたえる', 'to pass a message on (to someone on my side) — humble', '田中が戻りましたら、その旨申し伝えます。', 'When Tanaka returns, I will tell him so.', K],
  ['復唱', 'ふくしょう', 'repeating back to confirm', '念のため、お電話番号を復唱いたします。', 'Just to be sure, let me repeat your phone number.', null],
  ['ご用件', 'ごようけん', 'the matter you are calling about', 'ご用件をお伺いしてもよろしいでしょうか。', 'May I ask what your call is regarding?', S],
  ['お電話が遠い', 'おでんわがとおい', 'I can’t hear you well (the line is faint)', '恐れ入りますが、お電話が遠いようです。', 'I’m sorry, but I’m having trouble hearing you.', P],
  ['代わる', 'かわる', 'to take over (a call); to change places with', 'お電話代わりました。営業部の佐藤でございます。', 'Sato from Sales speaking; I’ve taken over the call.', null],
  ['電話口', 'でんわぐち', 'at the phone; the receiver', '担当者が電話口に出るまで、少々お待ちください。', 'Please hold until the person in charge comes to the phone.', null],
  ['戻り次第', 'もどりしだい', 'as soon as (he/she) is back', '戻り次第、こちらからご連絡差し上げます。', 'We will contact you as soon as they are back.', P],
  ['念のため', 'ねんのため', 'just to be sure; as a precaution', '念のため、ご連絡先を伺ってもよろしいですか。', 'Just in case, may I have your contact details?', null],
  ['伺う', 'うかがう', 'to ask; to hear; to visit — humble', 'お名前を伺ってもよろしいでしょうか。', 'May I ask your name?', K],
  ['失礼ですが', 'しつれいですが', 'excuse me, but… (before asking who is calling)', '失礼ですが、どちら様でしょうか。', 'Excuse me, but may I ask who is calling?', P],
  ['長引く', 'ながびく', 'to run long; to drag on', '会議が長引いておりまして、終了時刻が分かりかねます。', 'The meeting is running long, and I can’t say when it will end.', null],
  ['直通', 'ちょくつう', 'direct line', '担当者の直通番号をお伝えいたします。', 'I’ll give you the direct number for the person in charge.', null],
  ['内線', 'ないせん', 'extension (internal line)', '内線の203番におつなぎします。', 'I’ll connect you to extension 203.', null],
  ['保留', 'ほりゅう', 'putting (a call) on hold; shelving a decision', '確認いたしますので、一度保留にさせていただきます。', 'Let me check; I’ll put you on hold for a moment.', null],
  ['改めて', 'あらためて', 'again, at another time (formal)', '後ほど改めてお電話いたします。', 'I will call again later.', P],
  ['差し上げる', 'さしあげる', 'to give; to do (for you) — humble', '明日の午前中にこちらからお電話を差し上げます。', 'We will call you tomorrow morning.', K],
  ['お手すき', 'おてすき', 'when you have a free moment — honorific', 'お手すきの際に、折り返しお電話いただけますでしょうか。', 'Could you call me back when you have a moment?', S],
  ['先ほど', 'さきほど', 'a short while ago (formal for さっき)', '先ほどお電話いたしました山田と申します。', 'This is Yamada; I called a little while ago.', P],
  ['混み合う', 'こみあう', 'to be congested; (lines) to be busy', 'ただいま電話が大変混み合っております。', 'Our lines are extremely busy at the moment.', null],
];

const MAIL: Row[] = [
  ['査収', 'さしゅう', 'checking and accepting (what was sent)', '資料を添付いたしますので、ご査収ください。', 'I have attached the materials; please review them.', W],
  ['拝受', 'はいじゅ', 'receiving — humble, written', '請求書を拝受いたしました。', 'I have received the invoice.', K],
  ['失念', 'しつねん', 'forgetting; letting slip one’s mind (formal)', '返信を失念しておりました。申し訳ございません。', 'I forgot to reply. My apologies.', P],
  ['幸甚', 'こうじん', 'being most grateful; much obliged', 'ご意見をいただけますと幸甚に存じます。', 'I would be most grateful for your thoughts.', W],
  ['平素', 'へいそ', 'ordinarily; always (opening greetings)', '平素より大変お世話になっております。', 'Thank you for your continued support.', W],
  ['賜る', 'たまわる', 'to be given; to receive (from a superior) — humble', '貴重なご意見を賜り、誠にありがとうございます。', 'Thank you very much for your valuable feedback.', K],
  ['ご教示', 'ごきょうじ', 'telling / showing (how to do something)', '手続きの方法をご教示いただけますでしょうか。', 'Could you let me know the procedure?', P],
  ['ご容赦', 'ごようしゃ', 'forgiveness; forbearance', '行き違いでご連絡済みの場合は、何卒ご容赦ください。', 'If you have already been in touch, please excuse this message.', P],
  ['何卒', 'なにとぞ', 'kindly; earnestly (strengthens a request)', '何卒よろしくお願い申し上げます。', 'I earnestly ask for your kind cooperation.', P],
  ['取り急ぎ', 'とりいそぎ', 'for now; in haste (a brief note)', '取り急ぎ、受領のご連絡まで。', 'Just a quick note to confirm receipt.', W],
  ['存じます', 'ぞんじます', '(I) think; (I) know — humble', 'ご多忙のことと存じますが、ご確認をお願いいたします。', 'I know you are busy, but please take a look.', K],
  ['ご多忙', 'ごたぼう', '(your) being very busy', 'ご多忙のところ恐縮ですが、ご返信をお待ちしております。', 'I’m sorry to ask when you are so busy, but I look forward to your reply.', P],
  ['恐縮', 'きょうしゅく', 'feeling sorry to impose; being obliged', 'お忙しいところ恐縮ですが、ご対応をお願いいたします。', 'I’m sorry to bother you when you are busy, but please handle this.', P],
  ['ご放念', 'ごほうねん', 'disregarding; putting out of mind', '先ほどのメールは誤送信ですので、ご放念ください。', 'The previous email was sent in error; please disregard it.', W],
  ['別添', 'べってん', 'attached separately; enclosed', '詳細は別添の資料をご参照ください。', 'For details, please see the attached document.', W],
  ['標記', 'ひょうき', 'the matter named in the subject line', '標記の件につきまして、下記のとおりご連絡いたします。', 'Regarding the above subject, please see the following.', W],
  ['下記', 'かき', 'the following; set out below', '下記の日程でご都合はいかがでしょうか。', 'Would the following schedule suit you?', W],
  ['各位', 'かくい', 'everyone concerned (addressing a group)', '関係者各位、下記のとおり説明会を開催いたします。', 'To all concerned: a briefing will be held as follows.', W],
  ['末筆ながら', 'まっぴつながら', 'in closing (end of a formal letter)', '末筆ながら、貴社の益々のご発展をお祈り申し上げます。', 'In closing, I wish your company continued success.', W],
  ['拝見', 'はいけん', 'looking at; reading — humble', 'メールを拝見いたしました。', 'I have read your email.', K],
  ['追って', 'おって', 'later; in due course', '詳細は追ってご連絡いたします。', 'I will follow up with the details.', P],
  ['早急', 'さっきゅう', 'urgent; prompt (also read そうきゅう)', '早急にご対応いただけますと助かります。', 'It would help if you could deal with this promptly.', null],
  ['お含みおきください', 'おふくみおきください', 'please bear in mind', '納期が前後する可能性がございますので、あらかじめお含みおきください。', 'Please bear in mind that the delivery date may shift.', P],
  ['行き違い', 'いきちがい', 'crossing (of messages); misunderstanding', '本メールと行き違いでご入金いただいた場合は、ご容赦ください。', 'If your payment has crossed with this email, please excuse us.', null],
  ['略儀ながら', 'りゃくぎながら', 'informal though this is (thanking by email or letter)', '略儀ながら、メールにてお礼申し上げます。', 'Please accept my thanks by email, informal as it is.', W],
  ['鑑みる', 'かんがみる', 'to take into account; in light of', '昨今の情勢に鑑み、開催を見送ることといたしました。', 'In light of recent circumstances, we have decided not to hold the event.', W],
  ['所存', 'しょぞん', 'intention; what I mean to do — formal', '今後とも精進してまいる所存です。', 'I intend to keep working hard.', K],
  ['当方', 'とうほう', 'we; our side', '当方の確認不足でご迷惑をおかけしました。', 'Our failure to check caused you trouble.', P],
  ['先方', 'せんぽう', 'the other party (e.g. the client)', '先方の了承が得られ次第、作業に着手します。', 'We will start work once the other party agrees.', null],
  ['ご高配', 'ごこうはい', '(your) kind consideration', '格別のご高配を賜り、厚く御礼申し上げます。', 'Thank you sincerely for your exceptional consideration.', W],
  ['ご了承', 'ごりょうしょう', 'understanding; acceptance', '仕様は予告なく変更される場合がございます。あらかじめご了承ください。', 'Specifications may change without notice; thank you for your understanding.', P],
  ['ご一読', 'ごいちどく', 'reading through once', 'お時間のある際にご一読いただければ幸いです。', 'I would appreciate it if you could read it when you have time.', P],
  ['重ねて', 'かさねて', 'once again; repeatedly', '重ねてお詫び申し上げます。', 'Once again, I apologize.', P],
  ['拝察', 'はいさつ', 'surmising; inferring — humble, written', 'ご多忙のことと拝察いたします。', 'I imagine you must be very busy.', W],
  ['お手数', 'おてすう', 'trouble; bother (that you take for me)', 'お手数をおかけしますが、ご確認をお願いいたします。', 'I’m sorry for the trouble, but please confirm.', P],
  ['受領', 'じゅりょう', 'receipt (of documents, goods, money)', '本日、商品を確かに受領いたしました。', 'We duly received the goods today.', null],
  ['差し替え', 'さしかえ', 'replacement (of a file, page, version)', '先ほどの資料に誤りがありましたので、差し替えをお願いいたします。', 'There was an error in the earlier file; please replace it.', null],
  ['ひとえに', 'ひとえに', 'entirely; solely (thanks to)', 'これもひとえに皆様のご支援の賜物です。', 'This is entirely thanks to everyone’s support.', W],
  ['僭越ながら', 'せんえつながら', 'presumptuous though it is of me', '僭越ながら、一点ご指摘申し上げます。', 'With respect, may I point out one thing.', K],
];

const MEETING: Row[] = [
  ['稟議', 'りんぎ', 'approval request circulated to decision-makers', '新しいシステムの導入について稟議を上げる。', 'Submit an approval request for introducing the new system.', null],
  ['決裁', 'けっさい', 'final sign-off by the person with authority', '部長の決裁が下り次第、発注します。', 'We will place the order once the department head signs off.', null],
  ['進捗', 'しんちょく', 'progress', 'プロジェクトの進捗をご報告いたします。', 'Let me report on the project’s progress.', null],
  ['齟齬', 'そご', 'discrepancy; mismatch in understanding', '双方の認識に齟齬がないか確認させてください。', 'Let me confirm there is no mismatch in our understanding.', null],
  ['懸念', 'けねん', 'concern; worry', '納期について懸念があります。', 'I have a concern about the deadline.', null],
  ['叩き台', 'たたきだい', 'rough draft to start discussion from', 'まず叩き台を作って、来週の会議で議論しましょう。', 'Let’s make a rough draft first and discuss it at next week’s meeting.', null],
  ['根回し', 'ねまわし', 'laying the groundwork; lining up agreement beforehand', '会議の前に関係部署へ根回しをしておく。', 'Line up the departments concerned before the meeting.', null],
  ['落とし所', 'おとしどころ', 'point of compromise; where things can settle', '双方が納得できる落とし所を探る。', 'Look for a compromise both sides can accept.', null],
  ['すり合わせ', 'すりあわせ', 'aligning (views, specs, schedules)', '仕様について先方とすり合わせを行う。', 'Align with the client on the specification.', null],
  ['前倒し', 'まえだおし', 'moving (a schedule) forward', '納期を一週間前倒しすることは可能でしょうか。', 'Would it be possible to bring the deadline forward a week?', null],
  ['持ち帰る', 'もちかえる', 'to take (a matter) back to consider internally', '本件は一度持ち帰って検討させていただきます。', 'Allow us to take this back and consider it.', null],
  ['洗い出す', 'あらいだす', 'to identify exhaustively; to list out', '現状の課題をすべて洗い出しましょう。', 'Let’s list every current issue.', null],
  ['見送る', 'みおくる', 'to hold off on; to pass on (a proposal)', '今回は導入を見送ることになりました。', 'We have decided to hold off on adopting it this time.', null],
  ['忌憚', 'きたん', 'reserve (忌憚のない = frank)', '忌憚のないご意見をお聞かせください。', 'Please give us your frank opinion.', P],
  ['補足', 'ほそく', 'supplementary remark', '一点、補足させていただきます。', 'Let me add one point.', null],
  ['是正', 'ぜせい', 'correction; putting right', '指摘された問題点を速やかに是正する。', 'Promptly correct the problems that were pointed out.', null],
  ['善処', 'ぜんしょ', 'handling appropriately (often a non-committal reply)', 'ご指摘の点につきましては、善処いたします。', 'We will deal appropriately with the point you raised.', P],
  ['所感', 'しょかん', 'one’s impressions; thoughts', '研修に参加しての所感を述べる。', 'Give one’s impressions of the training.', null],
  ['懸案', 'けんあん', 'pending issue', '長年の懸案事項がようやく解決した。', 'A long-pending issue has finally been resolved.', null],
  ['趣旨', 'しゅし', 'purpose; gist', '本日の会議の趣旨をご説明します。', 'Let me explain the purpose of today’s meeting.', null],
  ['骨子', 'こっし', 'outline; main points', '提案書の骨子をまとめました。', 'I have put together the outline of the proposal.', null],
  ['棚上げ', 'たなあげ', 'shelving (an issue)', 'その議論はいったん棚上げにしましょう。', 'Let’s shelve that discussion for now.', null],
  ['折衷案', 'せっちゅうあん', 'compromise proposal', '両案の折衷案を検討する。', 'Consider a compromise between the two proposals.', null],
  ['言質', 'げんち', 'commitment; pledge (言質を取る)', '先方から納期について言質を取った。', 'We got a commitment from the client on the deadline.', null],
  ['合意形成', 'ごういけいせい', 'consensus-building', '関係者間の合意形成に時間がかかる。', 'Building consensus among the stakeholders takes time.', null],
  ['周知', 'しゅうち', 'making known to everyone', '変更点を全社員に周知する。', 'Make the changes known to all employees.', null],
  ['差し戻す', 'さしもどす', 'to send back (for revision)', '不備があったため、申請を差し戻しました。', 'The application was incomplete, so I sent it back.', null],
  ['属人化', 'ぞくじんか', '(work) becoming dependent on one person', '業務の属人化を防ぐため、マニュアルを整備する。', 'Maintain manuals so the work doesn’t depend on one person.', null],
  ['横展開', 'よこてんかい', 'rolling out (a practice) to other teams', '成功事例を他部署にも横展開する。', 'Roll the successful case out to other departments.', null],
  ['俯瞰', 'ふかん', 'overview; bird’s-eye view', '全体を俯瞰して優先順位を決める。', 'Take an overall view and set priorities.', null],
  ['喫緊', 'きっきん', 'pressing; urgent', '人手不足は喫緊の課題だ。', 'The labour shortage is a pressing issue.', W],
];

const HR: Row[] = [
  ['就業規則', 'しゅうぎょうきそく', 'work rules; employment regulations', '就業規則に基づき、処分を決定する。', 'Decide the penalty in accordance with the work rules.', null],
  ['試用期間', 'しようきかん', 'probation period', '試用期間は入社後三か月間とする。', 'The probation period is three months from joining.', null],
  ['雇止め', 'やといどめ', 'non-renewal of a fixed-term contract', '契約満了による雇止めを通知された。', 'I was notified my contract would not be renewed on expiry.', null],
  ['裁量労働制', 'さいりょうろうどうせい', 'discretionary working-hours system', '当社の開発職には裁量労働制が適用される。', 'The discretionary system applies to our development staff.', null],
  ['時間外労働', 'じかんがいろうどう', 'overtime work', '時間外労働は月45時間を上限とする。', 'Overtime is capped at 45 hours a month.', null],
  ['源泉徴収', 'げんせんちょうしゅう', 'withholding tax at source', '給与から所得税が源泉徴収される。', 'Income tax is withheld from salary.', null],
  ['年末調整', 'ねんまつちょうせい', 'year-end tax adjustment', '年末調整の書類を今月中に提出してください。', 'Please submit your year-end adjustment forms this month.', null],
  ['扶養', 'ふよう', 'support of dependents', '配偶者を扶養に入れる手続きを行う。', 'Complete the procedure to register a spouse as a dependent.', null],
  ['出向', 'しゅっこう', 'secondment (to an affiliate)', '四月から子会社に出向することになった。', 'I am being seconded to a subsidiary from April.', null],
  ['辞令', 'じれい', 'written notice of appointment or transfer', '本日付で異動の辞令が出た。', 'A transfer notice was issued effective today.', null],
  ['内示', 'ないじ', 'unofficial advance notice (of a transfer etc.)', '来月の異動について内示を受けた。', 'I was told unofficially about next month’s transfer.', null],
  ['人事考課', 'じんじこうか', 'personnel evaluation', '人事考課の結果は賞与に反映される。', 'Evaluation results are reflected in bonuses.', null],
  ['懲戒', 'ちょうかい', 'disciplinary action', '無断欠勤が続き、懲戒処分を受けた。', 'After repeated unexcused absences, he was disciplined.', null],
  ['守秘義務', 'しゅひぎむ', 'duty of confidentiality', '退職後も守秘義務を負う。', 'The duty of confidentiality continues after leaving.', null],
  ['競業避止', 'きょうぎょうひし', 'non-competition', '退職後一年間は競業避止義務が課される。', 'A non-compete obligation applies for a year after leaving.', W],
  ['締結', 'ていけつ', 'conclusion (of a contract)', '両社は業務提携契約を締結した。', 'The two companies concluded a business alliance agreement.', W],
  ['違約金', 'いやくきん', 'penalty for breaking a contract', '期間内に解約すると違約金がかかります。', 'Cancelling within the term incurs a penalty.', null],
  ['瑕疵', 'かし', 'defect; flaw (legal term)', '納品物に瑕疵があった場合は、無償で修補する。', 'If the deliverable is defective, it will be repaired free of charge.', W],
  ['遵守', 'じゅんしゅ', 'compliance; observance', '法令を遵守して業務を行う。', 'Carry out the work in compliance with laws and regulations.', null],
  ['抵触', 'ていしょく', 'conflict (with a law or rule)', 'その行為は社内規程に抵触するおそれがある。', 'That act may conflict with internal regulations.', W],
  ['免責', 'めんせき', 'exemption from liability', '天災による損害は免責とする。', 'Liability is excluded for damage caused by natural disasters.', W],
  ['業務委託', 'ぎょうむいたく', 'contracting work out; outsourcing', '業務委託契約を結んで開発を外注する。', 'Outsource development under a service agreement.', null],
  ['再委託', 'さいいたく', 'subcontracting (entrusting onward)', '事前の承諾なく業務を再委託してはならない。', 'Work must not be subcontracted without prior consent.', W],
  ['捺印', 'なついん', 'affixing a seal', '契約書に署名・捺印のうえ、ご返送ください。', 'Please sign and seal the contract and return it.', null],
  ['自動更新', 'じどうこうしん', 'automatic renewal', '契約は一年ごとに自動更新される。', 'The contract renews automatically every year.', null],
  ['損害賠償', 'そんがいばいしょう', 'compensation for damages', '契約違反により損害賠償を請求された。', 'They were sued for damages for breach of contract.', null],
  ['按分', 'あんぶん', 'proportional allocation', '費用を利用日数で按分する。', 'Allocate the cost in proportion to days of use.', null],
  ['相殺', 'そうさい', 'offsetting; setting off', '売掛金と買掛金を相殺する。', 'Offset receivables against payables.', null],
  ['督促', 'とくそく', 'demand; pressing for (payment)', '支払いが遅れている取引先に督促状を送る。', 'Send a reminder letter to a client whose payment is late.', null],
  ['検収', 'けんしゅう', 'acceptance inspection (of delivered work)', '納品後、十日以内に検収を行う。', 'Carry out acceptance inspection within ten days of delivery.', null],
  ['経費精算', 'けいひせいさん', 'expense claim settlement', '出張の経費精算は月末までに申請してください。', 'Please file business-trip expense claims by month end.', null],
  ['立て替える', 'たてかえる', 'to pay on someone’s behalf (to be reimbursed)', '交通費を一時的に立て替えた。', 'I covered the travel costs for the time being.', null],
];

const SERVICE: Row[] = [
  ['お詫び申し上げます', 'おわびもうしあげます', '(I) sincerely apologize — humble', 'ご迷惑をおかけしましたことを、深くお詫び申し上げます。', 'We deeply apologize for the trouble we have caused.', K],
  ['不手際', 'ふてぎわ', 'mishandling; a blunder on our part', 'こちらの不手際でご迷惑をおかけいたしました。', 'Our mishandling caused you trouble.', null],
  ['いたしかねます', 'いたしかねます', '(we) are unable to — polite refusal', '恐れ入りますが、返品には対応いたしかねます。', 'I’m afraid we are unable to accept returns.', K],
  ['ご不便', 'ごふべん', 'inconvenience (to you)', 'ご不便をおかけし、誠に申し訳ございません。', 'We sincerely apologize for the inconvenience.', P],
  ['真摯', 'しんし', 'sincere; earnest', 'お客様のご意見を真摯に受け止めます。', 'We take our customers’ comments seriously.', null],
  ['再発防止', 'さいはつぼうし', 'prevention of recurrence', '原因を究明し、再発防止に努めてまいります。', 'We will find the cause and work to prevent a recurrence.', null],
  ['代替品', 'だいたいひん', 'substitute; replacement item', '在庫がないため、代替品をご提案いたします。', 'As it is out of stock, let me suggest a substitute.', null],
  ['欠品', 'けっぴん', 'being out of stock', 'ご注文の商品は現在欠品しております。', 'The item you ordered is currently out of stock.', null],
  ['入荷', 'にゅうか', 'arrival of stock', '次回の入荷は来月上旬を予定しております。', 'The next shipment is expected early next month.', null],
  ['取り寄せ', 'とりよせ', 'ordering in (from a supplier or another branch)', '店頭に在庫がないため、お取り寄せとなります。', 'We have none in store, so it will have to be ordered in.', null],
  ['ご足労', 'ごそくろう', '(your) trouble of coming here — honorific', '本日はご足労いただき、ありがとうございます。', 'Thank you for taking the trouble to come today.', S],
  ['お納めください', 'おおさめください', 'please accept (this) — honorific', '心ばかりの品ですが、どうぞお納めください。', 'It is only a small token, but please accept it.', S],
  ['確認の上', 'かくにんのうえ', 'after checking', '状況を確認の上、折り返しご連絡いたします。', 'I will check the situation and get back to you.', P],
  ['ご指摘', 'ごしてき', '(your) pointing out; feedback', 'ご指摘いただいた点は、早急に改善いたします。', 'We will promptly fix the point you raised.', P],
  ['弁償', 'べんしょう', 'paying for (damage or loss)', '破損した商品は当店で弁償いたします。', 'The shop will pay for the damaged item.', null],
  ['補償', 'ほしょう', 'compensation; indemnity (≠ 保証, 保障)', '配送中の事故は補償の対象となります。', 'Accidents in transit are covered by compensation.', null],
  ['対象外', 'たいしょうがい', 'not covered; out of scope', 'お客様による破損は保証の対象外です。', 'Damage caused by the customer is not covered by the warranty.', null],
  ['お引き取り', 'おひきとり', 'taking back; collecting (also: please leave)', '不良品は弊社にてお引き取りいたします。', 'We will take back the defective item.', P],
  ['手配', 'てはい', 'arranging; arrangement', 'すぐに代わりの商品を手配いたします。', 'I will arrange a replacement right away.', null],
  ['不行き届き', 'ふゆきとどき', 'negligence; lack of proper care', '管理不行き届きにより、ご迷惑をおかけしました。', 'Our inadequate supervision caused you trouble.', null],
  ['ご期待に沿う', 'ごきたいにそう', 'to meet (your) expectations', 'ご期待に沿えず、申し訳ございません。', 'We are sorry we could not meet your expectations.', P],
  ['見合わせる', 'みあわせる', 'to suspend; to put off', '当面の間、販売を見合わせております。', 'Sales are suspended for the time being.', null],
  ['何なりと', 'なんなりと', 'anything at all; whatever it may be', 'ご不明な点がございましたら、何なりとお尋ねください。', 'If anything is unclear, please ask about anything at all.', P],
  ['お申し付けください', 'おもうしつけください', 'please tell us (what you need) — honorific', 'ご用の際は、係の者にお申し付けください。', 'If you need anything, please tell a member of staff.', S],
  ['ご愛顧', 'ごあいこ', 'patronage; continued custom', '日頃よりご愛顧いただき、誠にありがとうございます。', 'Thank you for your continued patronage.', P],
];

const IT: Row[] = [
  ['不具合', 'ふぐあい', 'malfunction; defect; bug', '最新版で不具合が確認されました。', 'A defect has been confirmed in the latest version.', null],
  ['障害', 'しょうがい', 'outage; failure; incident', 'ネットワーク障害が発生しています。', 'A network outage is in progress.', null],
  ['復旧', 'ふっきゅう', 'restoration (of service)', 'サーバーは午後三時に復旧しました。', 'The server was restored at 3 p.m.', null],
  ['切り分け', 'きりわけ', 'isolating (where a problem lies)', 'まず原因の切り分けを行います。', 'First we will isolate the cause.', null],
  ['再現', 'さいげん', 'reproducing (a problem)', 'その不具合はこちらの環境では再現しません。', 'That defect does not reproduce in our environment.', null],
  ['事象', 'じしょう', 'the observed issue; phenomenon', '同様の事象が他の端末でも発生していますか。', 'Is the same issue occurring on other devices?', null],
  ['暫定対応', 'ざんていたいおう', 'temporary workaround', '暫定対応として、再起動をお願いしています。', 'As a workaround, we are asking users to restart.', null],
  ['恒久対策', 'こうきゅうたいさく', 'permanent fix', '恒久対策は次回のリリースで実施します。', 'The permanent fix will ship in the next release.', null],
  ['権限', 'けんげん', 'permission; access rights', 'このフォルダを閲覧する権限がありません。', 'You do not have permission to view this folder.', null],
  ['付与', 'ふよ', 'granting (rights, points)', '管理者権限を付与しました。', 'Administrator rights have been granted.', null],
  ['脆弱性', 'ぜいじゃくせい', 'vulnerability', '深刻な脆弱性が見つかったため、至急更新してください。', 'A serious vulnerability was found; please update immediately.', null],
  ['適用', 'てきよう', 'applying (a patch, setting, rule)', '更新プログラムを適用した後、再起動が必要です。', 'A restart is required after applying the update.', null],
  ['互換性', 'ごかんせい', 'compatibility', '旧バージョンとの互換性は保証されません。', 'Compatibility with older versions is not guaranteed.', null],
  ['仕様', 'しよう', 'specification; intended behaviour', 'これは不具合ではなく、仕様です。', 'This is not a bug; it is by design.', null],
  ['改修', 'かいしゅう', 'modification (of a system)', '来月、システムの改修を予定しています。', 'A system modification is planned for next month.', null],
  ['移行', 'いこう', 'migration; transition', '新システムへのデータ移行が完了しました。', 'Data migration to the new system is complete.', null],
  ['冗長化', 'じょうちょうか', 'adding redundancy', 'サーバーを冗長化して障害に備える。', 'Make the servers redundant to guard against failure.', null],
  ['端末', 'たんまつ', 'device; terminal', '社用端末を紛失した場合は、直ちに報告してください。', 'If you lose a company device, report it immediately.', null],
  ['貸与', 'たいよ', 'lending out (company equipment)', '入社時にノートパソコンを貸与します。', 'A laptop is lent to you when you join.', null],
  ['初期化', 'しょきか', 'initialization; reset', 'パスワードを初期化しましたので、再設定してください。', 'Your password has been reset; please set a new one.', null],
  ['疎通確認', 'そつうかくにん', 'connectivity check', 'サーバーとの疎通確認が取れました。', 'Connectivity with the server has been confirmed.', null],
  ['閲覧', 'えつらん', 'viewing; browsing', 'このページは社内からのみ閲覧できます。', 'This page can be viewed only from inside the company.', null],
  ['多要素認証', 'たようそにんしょう', 'multi-factor authentication', '多要素認証を有効にしてください。', 'Please enable multi-factor authentication.', null],
  ['挙動', 'きょどう', 'behaviour (of software)', 'アップデート後、アプリの挙動が不安定です。', 'The app has been behaving erratically since the update.', null],
  ['退避', 'たいひ', 'moving (data) aside for safekeeping', '作業前にデータを別の場所へ退避してください。', 'Move the data somewhere safe before starting.', null],
  ['原因究明', 'げんいんきゅうめい', 'investigating the cause', '現在、原因究明を進めております。', 'We are currently investigating the cause.', null],
  ['起票', 'きひょう', 'opening (a ticket); issuing a slip', '障害を確認したら、まずチケットを起票してください。', 'When you confirm an incident, open a ticket first.', null],
  ['棚卸し', 'たなおろし', 'inventory count; stock-take', '年に一度、IT資産の棚卸しを行う。', 'Take inventory of IT assets once a year.', null],
  ['遠隔', 'えんかく', 'remote', '遠隔操作で設定を変更いたします。', 'I will change the setting by remote control.', null],
];

const GROUPS: [tag: string, rows: Row[]][] = [
  ['電話応対', PHONE],
  ['メール', MAIL],
  ['会議', MEETING],
  ['人事・契約', HR],
  ['接客', SERVICE],
  ['IT', IT],
];

/** Interleaved across topics so a day's new cards aren't all from one area. */
export const SEED: SeedEntry[] = (() => {
  const out: SeedEntry[] = [];
  const longest = Math.max(...GROUPS.map(([, rows]) => rows.length));
  for (let i = 0; i < longest; i++) {
    for (const [tag, rows] of GROUPS) {
      const row = rows[i];
      if (!row) continue;
      const [word, reading, meaning_en, example_ja, example_en, register] = row;
      out.push({ word, reading, meaning_en, example_ja, example_en, tags: [tag], register });
    }
  }
  return out;
})();
