/* 骨組みの言葉（3つ＋2つ）
 *   種目（Track）  ＝ 「やること」「食事」「運動」のような記録の種類。枡の並びを自分で持つ
 *   枡（Slot）     ＝ 1日を切った時間帯（午前／昼／午後／夕方以降、朝食／昼食／夕食／間食…）
 *   記録（Entry）  ＝ 1行＝その日のその1件。予定の時刻と実際の時刻を別々に持つ
 *   ⭐ いつもの（Template）＝ 記録の「型」。呼び出してから記録を作る（型そのものは事実ではない）
 *   🔁 繰り返し（Rule）    ＝ 「毎日」「週の最初の平日」のような規則。回（Occurrence）に展開して記録にする
 *
 * ⚠ 導出できる値は保存しない（「どの枡に入るか」「いつもの を何回使ったか」は読むときに数える）。
 * ⚠ 意味が違うものを同じ列に入れない（予定の時刻と実際の時刻／期限とやる日）。
 */
export type YMD = string;    // 'YYYY-MM-DD'（端末の暦＝JST）
export type Minute = number; // その日の 0:00 からの分（0..1440）
export type ISO = string;    // ISO 8601 の時刻

export type TrackKind = 'todo' | 'meal' | 'activity' | 'habit' | 'receipt' | 'custom';

export interface SlotDef {
  key: string;            // 内部名（保存される値・改名しない）
  label: string;          // 呼び名（自由に変えてよい）
  icon: string;
  /** 時間帯の始まり（分）。null＝**時刻で決まらない枡**（「時間帯なし」「間食」）＝人が選んだときだけ入る */
  startMin: Minute | null;
  /** 時間帯の終わり（分・任意）。省いたら次の枡の始まりまで。次の枡より前で終えると、その隙間は受け皿へ落ちる（食事の 15:00〜16:30＝間食） */
  endMin?: Minute | null;
  /** ☀ 始まりを日の出・日の入りで決める（あれば startMin より勝つ。startMin は白夜などで決まらない日の控え）。
   *  {base:'sunrise'|'sunset', offsetMin}＝日の出の30分前など／{base:'daylight', num, den}＝日の出〜日の入りを den 等分した num 番目 */
  sun?: { base: 'sunrise' | 'sunset'; offsetMin: number } | { base: 'daylight' | 'night'; num: number; den: number } | null;
}

export interface TrackFeatures {
  done: boolean;        // ✅ やった／🚫 やらなかった／🔀 代わりに を使う（やること・運動）
  photos: boolean;      // 📷 写真を付ける（食事）
  calendar: boolean;    // 📅 時刻つきの記録を Google カレンダーに出せる
  actualFirst: boolean; // 「実際」を主にする（食事＝食べた事実）／false＝「予定」を主にする（やること）
  daily?: boolean;      // 一日一回（座禅・薬）＝その日に ✅／🚫 を1タップ。詳細（時刻・メモ）は任意。省略＝false
  ai?: 'receipt' | 'meal' | null; // 🤖 写真を AI に読ませる種類（本人の鍵＝BYOK）。省略＝読ませない
  maxRunMin?: number | null;      // ⏵ 進行中がこの分を超えたら「まだ続いていますか？」と聞く（Toggl の長時間通知の写し）。省略＝180分・null＝聞かない
}

export interface Track {
  id: string;
  name: string;
  icon: string;
  kind: TrackKind;
  slots: SlotDef[];     // 表示順そのまま（並べ替えも設定で）
  fallbackKey: string;  // 受け皿＝時刻も選択も無い記録・どの時間帯にも当たらない時刻の記録が落ちる枡
  features: TrackFeatures;
  sortOrder: number;
  archived: boolean;    // 消さずに畳む（記録は残る）
  aliases?: string[];   // 合図で呼ぶときの別名（「ざぜん」「meditation」）
}

export type Priority = -1 | 0 | 1;
export interface Photo { path: string; thumb?: string; }

/** ⏭ 先送りの1回＝「この記録は from の日にあったが、at の時に後ろの日へ動かした」。
 *  ⚠ 動かした先は持たない＝次の1回の from（最後の1回なら いまの date）から読める（導出値は保存しない） */
export interface Postpone { from: YMD; at: ISO; }

export interface Entry {
  id: string;
  trackId: string;
  date: YMD;                   // やる日／食べた日（並べる軸）。⏭ 先送りで動くのはこの列
  slotKey: string | null;      // 人が選んだ枡（null＝時刻から決める。⚠ 人の選択は自動で上書きしない）
  planStart: Minute | null;    // 予定の時刻
  planEnd: Minute | null;
  planDur?: Minute | null;     // 予定の長さ（分）＝始まり・終わりと無関係に「30分やる」と書ける。省略＝null
  actualDate: YMD | null;      // 実際にやった日（予定の日と別物）
  actualStart: Minute | null;  // 実際の時刻
  actualEnd: Minute | null;
  actualDur?: Minute | null;   // 実際の長さ（分）＝「20分やった」だけの入力。始まり〜終わりがあればそちらが優先ではなく、書いた長さが勝つ
  doneAt: ISO | null;          // ✅ 済んだ時刻（消さずに残す）
  skippedAt: ISO | null;       // 🚫 やらないと決めた時刻（✅ と両立しない）
  insteadOfId: string | null;  // 🔀 どの記録の「代わりに」やったか（印は代わりの側の1列だけ）
  /** ⏭ 先送りの履歴（古い順）。省略・空＝一度も動かしていない。
   *  ⚠ 「日付を直す」（打ち間違いの訂正）では積まない＝先送りと訂正は意味が違う */
  postponed?: Postpone[];
  title: string;
  note: string | null;
  priority: Priority;          // 1=高／0=ふつう／-1=低
  tag: string | null;          // 🏷 集計ラベル
  templateId: string | null;   // ⭐ どの型から作ったか（型を消しても記録は残る）
  ruleId: string | null;       // 🔁 どの規則から入ったか（規則を消しても記録は残る）
  ruleDate: YMD | null;        // 🔁 その回の日付（ruleId と組で1行＝二重に作らない）
  photos: Photo[];
  payload: Record<string, unknown>; // 種目ごとの中身（食事: origin=home|store|out, items…）。数値のカロリー等は持たない
  calendar: boolean;           // 📅 この記録は外のカレンダーにも出す（時刻がある時だけ効く）
  sortOrder: number;
  createdAt: ISO;
  updatedAt: ISO;
}

export interface Template {
  id: string;
  trackId: string;
  name: string;                // 呼び名（「いつもの朝ごはん」）
  slotKey: string | null;      // 既定の枡（縛りではない＝呼んだ先の枡が勝つ）
  title: string;
  note: string | null;
  payload: Record<string, unknown>;
  photos: Photo[];             // 記録と**共有**（実体を増やさない）
  planStart: Minute | null;
  planEnd: Minute | null;
  planDur?: Minute | null;
  calendar: boolean;
  aliases?: string[];          // 合図で呼ぶときの別名（「ウォーキング」→ 散歩）
  sortOrder: number;
  createdAt: ISO;
  updatedAt: ISO;
}

export type Freq =
  | 'daily' | 'weekly' | 'everyN' | 'monthly' | 'monthhalf' | 'monthfull' | 'monthrange'
  | 'weekday' | 'holiday' | 'beforeoff' | 'notbeforeoff' | 'firstworkday' | 'lastworkday'
  | 'runstart' | 'runend';

export interface RuleException { del?: boolean; title?: string; note?: string; planStart?: Minute | null; planEnd?: Minute | null; }

export interface Rule {
  id: string;
  trackId: string;
  title: string;
  note: string | null;
  payload: Record<string, unknown>;
  templateId: string | null;
  freq: Freq;
  byday: number[];             // weekly のとき 0=日..6=土
  interval: number | null;     // everyN のとき N
  half: 'first' | 'second' | null; // monthhalf のとき
  dayFrom: number | null;      // monthrange のとき 1..31
  dayTo: number | null;
  startDate: YMD;
  endDate: YMD | null;         // null＝ずっと
  slotKey: string | null;
  planStart: Minute | null;
  planEnd: Minute | null;
  planDur?: Minute | null;
  priority: Priority;
  tag: string | null;
  auto: boolean;               // true＝その日が来たら自動で記録／false＝薄く出して、押した日だけ記録
  active: boolean;             // ⏸ 止める（消さずに休む）
  calendar: boolean;
  exceptions: Record<YMD, RuleException>; // {'2026-09-20': {del: true}}＝この回はなし
  sortOrder: number;
  createdAt: ISO;
  updatedAt: ISO;
}

export interface CalendarMapRow { entryId: string; provider: 'google'; eventId: string; contentHash: string; syncedAt: ISO; }

/** 升目に何を見せるか（🕐 開始時刻／⏱ 何分やった／💬 コメント／📷 写真）＝上の帯のアイコンで切り替える */
export interface ShowFlags { time: boolean; duration: boolean; note: boolean; photos: boolean; gap: boolean; }

export interface Settings {
  weekStart: 0 | 1;            // 週の始まり 0=日曜／1=月曜
  show?: ShowFlags;            // 省略＝既定（時刻・分・写真・ズレは出す、コメントは出さない）
  /** N日をひと区切り（サイクル）にして見る＝週（曜日で切る暦の区切り）とは別の見方。
   *  days＝ひと区切りの日数（3日・10日…）／from＝数え始める日。**読むときに切るだけ**で記録は書き換えない */
  cycle?: { days: number; from: YMD };
  /** 📷 手の形 → 合図の文 の対応表（人が決める）。省略＝既定（☝ 1本＝開始／✌ 2本＝終了）。
   *  写真は残さない＝手の形は命令であって記録ではない */
  gestures?: { gesture: string; say: string }[];
  /** 🤖 BYOK＝本人の API キー（端末内だけ・サーバに送らない）。呼び先の顔ぶれは src/ai/byok.ts の PROVIDERS と揃える */
  ai?: { provider: 'anthropic' | 'gemini' | 'openrouter'; key: string; model: string };
  autoStop?: boolean;          // 「開始」で他の進行中を自動で終了する（Now Then の「次をタップで前が止まる」）。省略＝true
  skipBreaksStreak?: boolean;  // 🚫 で 🔥 連続日数を切るか。省略＝false（🚫 は「今日は無し」＝第3の状態・Way of Life/Loop）
  notify?: boolean;            // 長時間走行を OS の通知でも知らせる（許可が要る）。省略＝false
  sunPlace?: { lat: number; lon: number; name?: string }; // ☀ 日の出・日の入りを計算する場所。省略＝東京
  listBase?: YMD | null;       // 📋 リストの基準日（ここから何日、を出す）。省略/null＝今日
  dayStart?: { base: 'midnight' } | { base: 'sunrise' | 'sunset'; offsetMin: number }; // 1日の始まり。省略＝0:00。記録は書き換えず、どの日に見せるかだけを読むときに決める
  storage?: { kind: 'local' | 'drive' | 'supabase'; windowDays?: number | null; lastPushedAt?: ISO; remoteSavedAt?: ISO; driveClientId?: string; driveFolder?: string; supabaseUrl?: string; supabaseSecret?: string; lastSync?: ISO; lastError?: string }; // 保存場所（外の写し）。省略＝端末のみ
  supabaseUrl: string;         // 📅 同期の Edge Function の場所（空＝未接続）
  calendarSecret: string;      // その合言葉（端末内だけ）
}

/** ⏱ なに未定の計測＝「⊞ すべて」で ▶ を押して始めた計測。種目も名前もまだ決めていない。
 *  計っている最中でも、計り終わってからでも「なに」を決められる → 決めた時点で記録（Entry）になり、ここからは消える */
export interface Timer { id: string; date: YMD; startMin: Minute; endMin: Minute | null; note: string | null; createdAt: ISO; }

/** 未振り分け＝どの種目か解けなかった合図。黙って捨てず、あとで種目を選ぶ */
export interface InboxItem { id: string; text: string; at: ISO; date: YMD; }

export interface Db {
  version: 1;
  savedAt?: ISO;               // 端末が最後に保存した時刻（外の写しと比べて「新しい方が勝つ」の基準）
  window?: { from: YMD } | null; // 外の写しだけに付く印＝「記録はこの日から先のぶんだけ入っている」。取り込む側はこの日より前を触らない
  inbox?: InboxItem[];
  timers?: Timer[];            // ⏱ なに未定の計測（進行中＝endMin が null）
  deleted?: string[];          // 消した記録の id（まだ外に伝えていないぶん）。送れたら空にする＝差分で「消した」を伝えるため
  tracks: Track[];
  entries: Entry[];
  templates: Template[];
  rules: Rule[];
  holidays: YMD[];             // 有給など、本人が足した休み（🔁 の平日／休日の判定に効く）
  calendarMap: CalendarMapRow[];
  settings: Settings;
}
