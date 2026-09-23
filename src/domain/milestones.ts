/* 🗓 記念日＝ライフログの表 milestones をそのまま正本にして、コマは読んで映し・足して直す（v30）。
 *  記録（Db）には入れない＝正本が2つにならない。端末には「最後に読めた一覧」を別の箱に控えるだけ（開いてすぐ出すため）。
 *  決まり（節目・リマインダー・経過日数）はライフログ web/src/week.js・milestones.js と同じ＝同じ日に同じ印が出る。
 *  ⚠ 経過日数・節目・次の周年は保存しない＝その日から数える（憲法1条）。
 */
import type { YMD } from './types';
import { addDays, addMonths, daysBetween } from './dates';

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
export interface MilestoneLog { id: number; milestoneId: number; date: YMD; note: string | null; photoCount: number; }

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
