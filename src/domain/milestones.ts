/* 🗓 記念日＝ライフログの表 milestones をそのまま正本にして、コマは読んで映し・足して直す（v30）。
 *  記録（Db）には入れない＝正本が2つにならない。端末には「最後に読めた一覧」を別の箱に控えるだけ（開いてすぐ出すため）。
 *  決まり（節目・リマインダー・経過日数）はライフログ web/src/week.js・milestones.js と同じ＝同じ日に同じ印が出る。
 *  ⚠ 経過日数・節目・次の周年は保存しない＝その日から数える（憲法1条）。
 */
import type { YMD, Minute } from './types';
import { addDays, addMonths, daysBetween } from './dates';
import { fmtMin, fmtDur } from './slots';

/** リマインダーの1つ＝記念日の n（月／週／日）前。毎年くりかえす */
export interface Reminder { u: 'm' | 'w' | 'd'; n: number; }
export interface Milestone {
  id: number;              // ライフログの行の番号
  title: string;
  date: YMD;               // event_date（日数を数える基準）
  time: string | null;     // event_time（記録用・日数には使わない）
  note: string | null;
  label: string | null;    // 旅行／仕事 など任意の1つ
  reminders: Reminder[];
  photoCount: number;      // 写真の数だけ（写真そのものは持ってこない＝憲法8条）
}
/** 記録ログ1件。⏱ start/end/dur＝はじめ・おわり・かかった時間（分・どれも任意・v34＝ライフログの表の列 start_min/end_min/dur_min）。
 *  ⚠ ライフログの表は「おわりと長さを同時に持たない」（時刻があれば長さは導く）＝送る前に logTimeResolve を通す。 */
export interface MilestoneLog { id: number; milestoneId: number; date: YMD; note: string | null; photoCount: number; start: Minute | null; end: Minute | null; dur: Minute | null; }

/** その日に出す印の1つ。kind＝節目（元の記念日から ±1/3/6ヶ月・N年前）／remind（🔔 本人が決めた N前） */
export interface MilestoneMark { id: number; title: string; label: string; kind: 'mark' | 'remind'; }

export const reminderLabel = (r: Reminder): string => `${r.n}${r.u === 'm' ? 'ヶ月' : r.u === 'w' ? '週間' : '日'}前`;

/** その日が記念日の「節目」か＝元の記念日を基準にした一直線（ライフログ weekMonthMarksFor と同じ）。
 *  過去の記念日（誕生・入社）には「前」は出ない＝最初の年の 1/3/6ヶ月だけ。未来の記念日には N年前・Nヶ月前のカウントダウン。
 *  ⚠ 周年そのもの（同じ月日で後の年）はここでは出さない（ライフログでも別の印）。 */
function monthMarks(d: YMD, m: Milestone): MilestoneMark[] {
  const out: MilestoneMark[] = []; const E = m.date;
  for (const n of [1, 3, 6]) {
    if (addMonths(E, n) === d) out.push({ id: m.id, title: m.title, label: `${n}ヶ月`, kind: 'mark' });
    if (addMonths(E, -n) === d) out.push({ id: m.id, title: m.title, label: `${n}ヶ月前`, kind: 'mark' });
  }
  if (d.slice(5) === E.slice(5)) { const k = +E.slice(0, 4) - +d.slice(0, 4); if (k >= 1) out.push({ id: m.id, title: m.title, label: `${k}年前`, kind: 'mark' }); }
  return out;
}
/** 🔔 リマインダー＝これから来る周年（今年／来年・当日を含む）から逆算して d に当たれば出す（ライフログ weekReminderMarksFor と同じ） */
function reminderMarks(d: YMD, m: Milestone): MilestoneMark[] {
  const out: MilestoneMark[] = []; const mmdd = m.date.slice(5), dy = +d.slice(0, 4);
  for (let y = dy; y <= dy + 1; y++) {
    const anniv = annivIn(y, mmdd);
    if (anniv < d) continue;
    for (const r of m.reminders) {
      const at = r.u === 'm' ? addMonths(anniv, -r.n) : addDays(anniv, -(r.u === 'w' ? 7 * r.n : r.n));
      if (at === d) out.push({ id: m.id, title: m.title, label: reminderLabel(r), kind: 'remind' });
    }
  }
  return out;
}
/** その年の周年の日。2/29 生まれは平年なら 2/28 に寄せる（日付として無い日を作らない） */
function annivIn(y: number, mmdd: string): YMD {
  if (mmdd === '02-29' && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) return `${y}-02-28`;
  return `${y}-${mmdd}`;
}

/** その日に出す印（🔔 と同じ記念日・同じ言葉の節目は二重に出さない＝ライフログと同じ） */
export function marksOn(d: YMD, ms: Milestone[]): MilestoneMark[] {
  const rem = ms.flatMap((m) => reminderMarks(d, m));
  const keys = new Set(rem.map((x) => `${x.id}|${x.label}`));
  return [...ms.flatMap((m) => monthMarks(d, m)).filter((x) => !keys.has(`${x.id}|${x.label}`)), ...rem];
}

/** 年・ヶ月・日の差（from ≦ to の前提）。「1年2ヶ月3日」。
 *  月は addMonths（月末に寄せる）で数え、越えない所まで進めて残りを日にする。
 *  ⚠ ライフログの msCalDiff は「to の前の月の日数を借りる」ので、1/31 → 3/1 が「1ヶ月-2日」になる＝ここでは写さなかった */
export function calDiff(from: YMD, to: YMD): { y: number; m: number; d: number } {
  let k = (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7));
  while (k > 0 && addMonths(from, k) > to) k--;
  return { y: Math.floor(k / 12), m: k % 12, d: daysBetween(addMonths(from, k), to) };
}
export const calText = (c: { y: number; m: number; d: number }): string => [c.y ? `${c.y}年` : '', c.m ? `${c.m}ヶ月` : '', c.d ? `${c.d}日` : ''].join('') || '0日';

/** 一覧の1行＝基準日から見た「N日たった／あとN日」と、次の周年までの日数（どれも数えるだけ） */
export interface MilestoneRow { m: Milestone; days: number; cal: string; nextAnniv: YMD; untilNext: number; years: number; }
export function rowOf(m: Milestone, today: YMD): MilestoneRow {
  const days = daysBetween(m.date, today); // ＋＝たった／−＝まだ来ていない
  const cal = calText(days >= 0 ? calDiff(m.date, today) : calDiff(today, m.date));
  let y = +today.slice(0, 4); let next = annivIn(y, m.date.slice(5));
  if (next < today) next = annivIn(++y, m.date.slice(5));
  if (next < m.date) next = m.date; // まだ来ていない記念日＝次はその日そのもの
  return { m, days, cal, nextAnniv: next, untilNext: daysBetween(today, next), years: +next.slice(0, 4) - +m.date.slice(0, 4) };
}
/** 一覧の並び＝次に来る順（今日が周年のものが先頭） */
export const rowsOf = (ms: Milestone[], today: YMD): MilestoneRow[] => ms.map((m) => rowOf(m, today)).sort((a, b) => a.untilNext - b.untilNext || a.m.date.localeCompare(b.m.date));

/** 記録ログの「記念日から N日目」（ライフログと同じ＝記念日の当日が 0日） */
export const logDay = (m: Milestone, l: MilestoneLog): number => daysBetween(m.date, l.date);

/** 送る前の検査（関数の側でも同じことを見る＝壊れた行を正本に書かない） */
export function checkMilestone(x: { title: string; date: string; time?: string | null; reminders?: Reminder[] }): string | null {
  if (!x.title.trim()) return '名前を入れてください';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return '日付を入れてください';
  if (x.time && !/^\d{2}:\d{2}(:\d{2})?$/.test(x.time)) return '時刻は HH:MM で';
  for (const r of x.reminders ?? []) if (!['m', 'w', 'd'].includes(r.u) || !Number.isInteger(r.n) || r.n < 1 || r.n > 366) return 'リマインダーは 1〜366 の数で';
  return null;
}

/** ⏱ 記録ログの はじめ・おわり・かかった時間を、ライフログの表の約束に合わせて決める（v34）。
 *  ⚠ 規則はライフログ web の tdDurResolve と同じ（ライフログの記念日パネルとコマで、同じ入力が同じ姿で残る）：
 *   ・長さが無い → そのまま
 *   ・おわりがある → 長さは持たない（はじめが空なら おわり−長さ＝「いま終わった・2時間」→ 2時間前〜いま）
 *   ・はじめだけ → おわり＝はじめ＋長さ（24:00 を越えるなら長さのまま）
 *   ・どちらも無い → 長さだけ
 *  ⚠ コマ自身の記録（Entry）は「長さ」と「終わり」を両方持てる＝あちらの決め方（durationOf）とは別。記念日の正本はライフログの表なので、表の約束に従う。 */
export function logTimeResolve(start: Minute | null, end: Minute | null, dur: Minute | null): { start: Minute | null; end: Minute | null; dur: Minute | null } {
  if (dur == null) return { start, end, dur: null };
  if (end != null) return (start == null && end - dur >= 0) ? { start: end - dur, end, dur: null } : { start, end, dur: null };
  if (start != null) return (start + dur <= 1440) ? { start, end: start + dur, dur: null } : { start, end: null, dur };
  return { start: null, end: null, dur };
}
/** 送る前の検査＝おわりは はじめ より後（幅ゼロも断る）・長さは 1〜1440（ライフログの関数と同じ） */
export function checkLogTime(r: { start: Minute | null; end: Minute | null; dur: Minute | null }): string | null {
  if (r.start != null && r.end != null && r.end <= r.start) return 'おわりが、はじめより前（か同じ）になっています';
  if (r.dur != null && (r.dur < 1 || r.dur > 1440)) return 'かかった時間は 1分〜24時間で';
  return null;
}
/** 一覧の言い方＝「10:00〜12:00（2時間）」「10:00〜」「〜12:00」「⏱2時間」「22:00〜 ⏱5時間」（ライフログの msLogTimeWord と同じ中身） */
export function logTimeText(l: Pick<MilestoneLog, 'start' | 'end' | 'dur'>): string {
  const parts: string[] = [];
  if (l.start != null && l.end != null) parts.push(`${fmtMin(l.start)}〜${l.end >= 1440 ? '24:00' : fmtMin(l.end)}（${fmtDur(l.end - l.start)}）`);
  else if (l.start != null) parts.push(`${fmtMin(l.start)}〜`);
  else if (l.end != null) parts.push(`〜${l.end >= 1440 ? '24:00' : fmtMin(l.end)}`);
  if (l.dur != null) parts.push(`⏱${fmtDur(l.dur)}`);
  return parts.join(' ');
}
/** その記録ログに何分かけたか（数えるだけ・保存しない）＝はじめ〜おわりがあればその差、無ければ長さ、どちらも無ければ null */
export const logMinutes = (l: Pick<MilestoneLog, 'start' | 'end' | 'dur'>): Minute | null =>
  (l.start != null && l.end != null && l.end > l.start ? l.end - l.start : l.dur ?? null);

