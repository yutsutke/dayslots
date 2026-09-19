/* ☀ 日の出・日の入り＝場所（緯度・経度）と日付から計算する（NOAA の簡易式・誤差は1〜2分）。
 *  枡の境目に使うので**5分刻みに丸める**（ゆう 2026-09-20「精度は5分単位ぐらいでも十分」）。
 *  通信しない・保存しない＝読むときに計算する（境目を記録に焼き込まない、の約束のまま）。
 *  白夜・極夜（日が出ない／沈まない）では null＝呼び手は枡の素の時刻に戻る。
 */
import type { YMD, Minute } from './types';

export interface SunPlace { lat: number; lon: number; name?: string; tzMin?: number } // tzMin＝UTC との差（分）。省略＝端末の時計
export const TOKYO: SunPlace = { lat: 35.68, lon: 139.77, name: '東京' };

const rad = (d: number) => (d * Math.PI) / 180;
const round5 = (m: number) => Math.round(m / 5) * 5;

/** その日の日の出・日の入り（その土地の時計での分・5分刻み）。出ない／沈まない日は null */
export function sunTimes(date: YMD, place: SunPlace = TOKYO): { rise: Minute; set: Minute } | null {
  const [y, m, d] = date.split('-').map(Number);
  const n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1; // その年の何日目か
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)); // 均時差（分）
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const c = Math.cos(rad(90.833)) / (Math.cos(rad(place.lat)) * Math.cos(decl)) - Math.tan(rad(place.lat)) * Math.tan(decl);
  if (c < -1 || c > 1) return null;
  const ha = (Math.acos(c) * 180) / Math.PI;
  const tz = place.tzMin ?? -new Date(y, m - 1, d, 12).getTimezoneOffset();
  const norm = (x: number) => ((x % 1440) + 1440) % 1440;
  return { rise: round5(norm(720 - 4 * (place.lon + ha) - eq + tz)), set: round5(norm(720 - 4 * (place.lon - ha) - eq + tz)) };
}

/** 枡の境目の決め方（太陽）。
 *   sunrise / sunset ＋ offsetMin（負＝前。「日の出の30分前」＝ {base:'sunrise', offsetMin:-30}）
 *   daylight ＝ 日の出から日の入りを den 等分した num 番目の境目（3等分の1つ目＝ {base:'daylight', num:1, den:3}） */
export type SunRule = { base: 'sunrise' | 'sunset'; offsetMin: number } | { base: 'daylight'; num: number; den: number };

export function sunMinute(rule: SunRule, date: YMD, place: SunPlace = TOKYO): Minute | null {
  const t = sunTimes(date, place); if (!t) return null;
  const raw = rule.base === 'daylight' ? t.rise + ((t.set - t.rise) * rule.num) / Math.max(1, rule.den) : (rule.base === 'sunrise' ? t.rise : t.set) + rule.offsetMin;
  return Math.min(1435, Math.max(0, round5(raw)));
}

export function describeSun(rule: SunRule): string {
  if (rule.base === 'daylight') return `昼を${rule.den}等分の${rule.num}つ目`;
  const name = rule.base === 'sunrise' ? '日の出' : '日の入り';
  return rule.offsetMin === 0 ? name : `${name}の${Math.abs(rule.offsetMin)}分${rule.offsetMin < 0 ? '前' : '後'}`;
}
