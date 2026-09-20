/* N日をひと区切り（サイクル）にして見る。区切り方の決まりはここ ただ1つ。
 *  ・週（7日）は**曜日に合わせる暦の区切り**。サイクルは**基準日から数える区切り**＝別のもの。
 *    だから週の画面はそのまま残し、サイクルは別の見方として足す（意味が違うものを1つにしない）
 *  ・どの区切りに入るかは**読むときに数える**＝記録には何も足さない（憲法1条）。
 *    基準日や日数を変えれば、過去の記録もその場で切り直る（枡の境目と同じ約束）
 *  ・基準日より前の日も同じ幅で切る（0周目・-1周目…）＝途中から数え始めても、それ以前が崩れない
 */
import type { YMD } from './types';
import { addDays, daysBetween } from './dates';

export const MIN_CYCLE = 2, MAX_CYCLE = 31;

/** その日を含む区切りの初日。⚠ 切り捨ては floor＝基準日より前（負の差）でも幅が揃う */
export function cycleStart(d: YMD, from: YMD, days: number): YMD {
  return addDays(from, Math.floor(daysBetween(from, d) / days) * days);
}

/** その日を含む区切りの最終日 */
export function cycleEnd(d: YMD, from: YMD, days: number): YMD {
  return addDays(cycleStart(d, from, days), days - 1);
}

/** 何周目か＝**基準日を含む区切りが1周目**。その前は 0周目・-1周目… */
export function cycleIndex(d: YMD, from: YMD, days: number): number {
  return Math.floor(daysBetween(from, d) / days) + 1;
}

/** 設定の検査。戻り＝日本語のエラー（空＝通る） */
export function validateCycle(days: number, from: YMD): string[] {
  const errs: string[] = [];
  if (!Number.isInteger(days) || days < MIN_CYCLE || days > MAX_CYCLE) errs.push(`ひと区切りの日数は ${MIN_CYCLE}〜${MAX_CYCLE} 日です`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) errs.push('数え始める日の書き方が違います（YYYY-MM-DD）');
  return errs;
}
