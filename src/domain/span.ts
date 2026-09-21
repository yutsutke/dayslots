/* 📆 長い期間（3か月・半年・1年）で見る＝**たまにしかやらないこと**のため。
 *  ・週・月では、月に1回のことは升目がほとんど空になって「やっているのか」が分からない。
 *    長い窓にすると、見たいものが「点の並び」ではなく**間隔**として見える。
 *  ・窓は**週に揃える**（縦7＝曜日／横＝週 の升目にするため）＝端が半端な週にならない。
 *  ・数はぜんぶ読むときに数える＝記録には何も足さない（憲法1条）。
 */
import type { YMD } from './types';
import { addDays, addMonths, weekStartOf, daysBetween } from './dates';

export const SPANS = [3, 6, 12] as const;
export type SpanMonths = (typeof SPANS)[number];
export const SPAN_LABEL: Record<SpanMonths, string> = { 3: '3か月', 6: '半年', 12: '1年' };

/** N か月の窓＝[週の頭, 週の終わり]。終わりは基準日を含む週の終わり（その週まで見せる） */
export function spanRange(anchor: YMD, months: SpanMonths, weekStart: 0 | 1): [YMD, YMD] {
  const to = addDays(weekStartOf(anchor, weekStart), 6);
  return [weekStartOf(addMonths(anchor, -months), weekStart), to];
}

/** 窓の中の週の数（升目の横の本数）。窓は週に揃っているので割り切れる */
export function spanWeeks(from: YMD, to: YMD): number {
  return Math.round((daysBetween(from, to) + 1) / 7);
}

/** たまにしかやらないことを読む数。hits＝やった日（重複なし）。順番は問わない（中で並べ替える）
 *  ・last／sinceLast＝最後にやった日と、そこから何日（「しばらくやっていない」が一目で分かる）
 *  ・avgGap＝だいたい何日に1回（やった日が2日以上ないと出せない＝null）
 *  ・maxGap＝いちばん空いた間隔（「一度3か月空いた」が分かる） */
export function spanStats(hits: YMD[], today: YMD): {
  days: number; last: YMD | null; sinceLast: number | null; avgGap: number | null; maxGap: number | null;
} {
  const ds = [...new Set(hits)].sort();
  if (!ds.length) return { days: 0, last: null, sinceLast: null, avgGap: null, maxGap: null };
  const last = ds[ds.length - 1];
  let maxGap: number | null = null;
  for (let i = 1; i < ds.length; i++) { const g = daysBetween(ds[i - 1], ds[i]); if (maxGap == null || g > maxGap) maxGap = g; }
  return {
    days: ds.length, last, sinceLast: daysBetween(last, today),
    // 平均は「最初から最後までを、間の数で割る」＝やった日が1日だけなら間が無いので出さない
    avgGap: ds.length >= 2 ? Math.round(daysBetween(ds[0], last) / (ds.length - 1)) : null,
    maxGap,
  };
}
