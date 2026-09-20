/* ⏭ 先送り＝「やる日」を後ろへ動かす。読み方はここ ただ1つ。
 *  ・動かすのは `date` だけ。もともとの日は履歴（`postponed`）に積んで**消さない**（憲法3条）
 *  ・「もともといつだったか」「何回動かしたか」は履歴から**数える**＝別の列に持たない（憲法1条）
 *  ・先送りは後ろへだけ。前へ戻す・打ち間違いを直すのは「日付を直す」＝別の操作で、履歴に積まない（憲法2条）
 *    ＝この履歴は「延ばした回数」だけを表す。前倒しを混ぜるとその意味が濁る
 *  ・🚫 やらない・🔀 代わりに は先送りの**後でも選べる**＝履歴は残したまま印が立つ（repo 側）
 */
import type { Entry, YMD } from './types';
import { daysBetween } from './dates';

export type PostponeInput = Pick<Entry, 'date' | 'postponed'>;

/** 何回 先送りしたか（0＝一度も動かしていない） */
export function postponeCount(e: PostponeInput): number {
  return e.postponed?.length ?? 0;
}

/** もともとの日＝いちばん古い履歴の from。動かしていなければ いまの日 */
export function originalDate(e: PostponeInput): YMD {
  return e.postponed?.[0]?.from ?? e.date;
}

/** 動いてきた日を古い順に並べる（もともとの日 … いまの日）。動かしていなければ1つだけ */
export function postponeChain(e: PostponeInput): YMD[] {
  return [...(e.postponed ?? []).map((p) => p.from), e.date];
}

/** 何日ぶん延びたか＝もともとの日 から いまの日 まで。動かしていなければ 0 */
export function postponeDays(e: PostponeInput): number {
  return daysBetween(originalDate(e), e.date);
}

/** 一行の言い方＝「09-18 から 2回先送り（12日）」。動かしていなければ空 */
export function fmtPostpone(e: PostponeInput): string {
  const n = postponeCount(e); if (!n) return '';
  return `${originalDate(e).slice(5)} から ${n}回先送り（${postponeDays(e)}日）`;
}
