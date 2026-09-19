/* 1日の始まり＝0:00／🌅 日の出／🌇 日の入り（±分）。「どの日に見せるか」を読むときに決める。
 *  ・記録の暦の日付（date）と時刻は**書き換えない**＝境目と同じ約束。設定を戻せば元の見え方に戻る
 *  ・日の出始まり＝その日の日の出より前の時刻は「前の日」に見せる（未明 3:00 の記録は前の日の続き＝江戸の明け六つ始まり）
 *  ・日の入り始まり＝その日の日の入り以後の時刻は「次の日」に見せる（日没で日付が変わる暦と同じ）
 *  ・時刻の無い記録は暦の日のまま（動かす理由が無い）
 */
import type { YMD, Minute } from './types';
import { addDays, todayYMD, nowMinute } from './dates';
import { sunMinute, TOKYO, type SunPlace } from './sun';

export type DayStart = { base: 'midnight' } | { base: 'sunrise' | 'sunset'; offsetMin: number };
export const MIDNIGHT: DayStart = { base: 'midnight' };

const cache = new Map<string, Minute | null>();
/** その暦の日の「切り替わりの時刻」（分）。日の出始まり＝その日の日の出±、日の入り始まり＝その日の日の入り±。0:00 始まり・白夜などは null */
export function switchMinute(date: YMD, ds: DayStart, place: SunPlace = TOKYO): Minute | null {
  if (ds.base === 'midnight') return null;
  const k = `${date}|${ds.base}|${ds.offsetMin}|${place.lat}|${place.lon}|${place.tzMin ?? ''}`;
  if (!cache.has(k)) cache.set(k, sunMinute({ base: ds.base, offsetMin: ds.offsetMin }, date, place));
  return cache.get(k) ?? null;
}
/** 暦の日付と時刻 → 見せる日 */
export function viewDateOf(date: YMD, minute: Minute | null, ds: DayStart, place: SunPlace = TOKYO): YMD {
  if (minute == null || ds.base === 'midnight') return date;
  const sw = switchMinute(date, ds, place); if (sw == null) return date;
  if (ds.base === 'sunrise') return minute < sw ? addDays(date, -1) : date;
  return minute >= sw ? addDays(date, 1) : date;
}
/** いまは「どの日」か */
export function viewToday(ds: DayStart, place: SunPlace = TOKYO, now: Date = new Date()): YMD {
  return viewDateOf(todayYMD(now), nowMinute(now), ds, place);
}
/** 見出し用＝その「見せる日」が何時に始まるか（0:00 始まりは空） */
export function dayStartLabel(viewDate: YMD, ds: DayStart, place: SunPlace = TOKYO): string {
  if (ds.base === 'midnight') return '';
  const d = ds.base === 'sunrise' ? viewDate : addDays(viewDate, -1); // 日の入り始まりの日は、前の暦の日の日の入りから
  const sw = switchMinute(d, ds, place); if (sw == null) return '';
  const hm = `${String(Math.floor(sw / 60)).padStart(2, '0')}:${String(sw % 60).padStart(2, '0')}`;
  return ds.base === 'sunrise' ? `🌅${hm}〜` : `🌇前日${hm}〜`;
}
