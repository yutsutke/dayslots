import type { YMD } from './types';

export const p2 = (n: number): string => String(n).padStart(2, '0');
export function todayYMD(now = new Date()): YMD { return `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`; }
export function nowMinute(now = new Date()): number { return now.getHours() * 60 + now.getMinutes(); }
const parts = (d: YMD): [number, number, number] => { const [y, m, dd] = d.split('-').map(Number); return [y, m, dd]; };
export function addDays(d: YMD, delta: number): YMD {
  const [y, m, dd] = parts(d); const dt = new Date(Date.UTC(y, m - 1, dd + delta));
  return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`;
}
export function dowOf(d: YMD): number { const [y, m, dd] = parts(d); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); } // 0=日..6=土
export function daysBetween(a: YMD, b: YMD): number {
  const [y1, m1, d1] = parts(a), [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
export function lastDayOfMonth(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function weekStartOf(d: YMD, weekStart: 0 | 1): YMD { return addDays(d, -((dowOf(d) - weekStart + 7) % 7)); }
export const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
