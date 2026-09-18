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

export type TrackKind = 'todo' | 'meal' | 'activity' | 'habit' | 'custom';

export interface SlotDef {
  key: string;            // 内部名（保存される値・改名しない）
  label: string;          // 呼び名（自由に変えてよい）
  icon: string;
  /** 時間帯の始まり（分）。null＝**時刻で決まらない枡**（「時間帯なし」「間食」）＝人が選んだときだけ入る */
  startMin: Minute | null;
  /** 時間帯の終わり（分・任意）。省いたら次の枡の始まりまで。次の枡より前で終えると、その隙間は受け皿へ落ちる（食事の 15:00〜16:30＝間食） */
  endMin?: Minute | null;
}

export interface TrackFeatures {
  done: boolean;        // ✅ やった／🚫 やらなかった／🔀 代わりに を使う（やること・運動）
  photos: boolean;      // 📷 写真を付ける（食事）
  calendar: boolean;    // 📅 時刻つきの記録を Google カレンダーに出せる
  actualFirst: boolean; // 「実際」を主にする（食事＝食べた事実）／false＝「予定」を主にする（やること）
  daily?: boolean;      // 一日一回（座禅・薬）＝その日に ✅／🚫 を1タップ。詳細（時刻・メモ）は任意。省略＝false
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
}

export type Priority = -1 | 0 | 1;
export interface Photo { path: string; thumb?: string; }

export interface Entry {
  id: string;
  trackId: string;
  date: YMD;                   // やる日／食べた日（並べる軸）
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
export interface ShowFlags { time: boolean; duration: boolean; note: boolean; photos: boolean; }

export interface Settings {
  weekStart: 0 | 1;            // 週の始まり 0=日曜／1=月曜
  show?: ShowFlags;            // 省略＝既定（時刻・分・写真は出す、コメントは出さない）
  supabaseUrl: string;         // 📅 同期の Edge Function の場所（空＝未接続）
  calendarSecret: string;      // その合言葉（端末内だけ）
}

export interface Db {
  version: 1;
  tracks: Track[];
  entries: Entry[];
  templates: Template[];
  rules: Rule[];
  holidays: YMD[];             // 有給など、本人が足した休み（🔁 の平日／休日の判定に効く）
  calendarMap: CalendarMapRow[];
  settings: Settings;
}
