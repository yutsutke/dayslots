/* 📷 手の形で合図＝写真を1枚 → 手の形 → **前もって決めておいた合図の文** → いつもの合図の道へ。
 *  ・手の形は**決まった顔ぶれからしか受け取らない**＝AI に言葉を作らせない（憲法7条・分からないものを作らない）。
 *    顔ぶれに無い言葉・迷った返事は すべて unknown に落とす
 *  ・「どの手の形か」と「何の合図にするか」は別＝対応表は人が決める（AI は形を見るだけ）。
 *    合図の文の読み方は今までどおり `signal.ts` ただ1つ＝ここでは新しい命令を作らない
 *  ・写真は**残さない**＝手の形は命令であって記録ではない（憲法8条・大きいものは記録に埋めない）
 */

/** AI に選ばせる顔ぶれ。増やすときは、見て一目で区別が付く形だけにする */
export const GESTURES = ['one', 'two', 'three', 'fist', 'open', 'thumb'] as const;
export type Gesture = (typeof GESTURES)[number];
export type GestureRead = Gesture | 'unknown';

export const GESTURE_LABEL: Record<GestureRead, string> = {
  one: '☝ 人差し指を1本',
  two: '✌ 人差し指と中指（ピース）',
  three: '🤟 指を3本',
  fist: '✊ グー（握る）',
  open: '🖐 パー（開く）',
  thumb: '👍 親指を立てる',
  unknown: '— 分からない',
};

/** 対応表の1行＝この手の形なら、この合図の文を入れる */
export interface GestureRule { gesture: Gesture; say: string; }

/** 初めのうちの表＝ゆうの例そのまま（人差し指1本＝スタート／2本＝ストップ） */
export const GESTURE_DEF: GestureRule[] = [
  { gesture: 'one', say: '開始' },
  { gesture: 'two', say: '終了' },
];

/** 表から合図の文を引く。決めていなければ null（＝勝手に何かを入れない） */
export function sayFor(rules: GestureRule[], g: GestureRead): string | null {
  if (g === 'unknown') return null;
  return rules.find((r) => r.gesture === g)?.say.trim() || null;
}

/** AI の返事（何が来るか分からない）を、決まった顔ぶれに落とす。
 *  ⚠ 顔ぶれに無い・形が壊れている・AI 自身が迷っている → すべて unknown 扱いで「入れない」側に倒す */
export function checkGesture(raw: unknown): { gesture: GestureRead; sure: boolean; reason: string | null } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const g = typeof o.gesture === 'string' ? o.gesture.trim().toLowerCase() : '';
  const gesture: GestureRead = (GESTURES as readonly string[]).includes(g) ? (g as Gesture) : 'unknown';
  const sure = gesture !== 'unknown' && o.sure !== false;  // 書いていなければ「迷っていない」とみなす
  const reason = typeof o.reason === 'string' && o.reason.trim() ? o.reason.trim().slice(0, 120) : null;
  return { gesture, sure, reason };
}

/** 表を保存する前の検査。戻り＝日本語のエラー（空＝通る） */
export function validateGestures(rules: GestureRule[]): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const r of rules) {
    if (!(GESTURES as readonly string[]).includes(r.gesture)) { errs.push(`知らない手の形です: ${r.gesture}`); continue; }
    if (seen.has(r.gesture)) errs.push(`同じ手の形が2つあります: ${GESTURE_LABEL[r.gesture]}`);
    seen.add(r.gesture);
    if (!r.say.trim()) errs.push(`合図の文が空です: ${GESTURE_LABEL[r.gesture]}`);
  }
  return errs;
}
