/* ズレ＝予定と実際の差を読む。ここ ただ1つ。
 *  ・差は保存しない＝予定の列と実際の列はもう在る。**読むときに引く**（境目と同じ約束）
 *    だから予定を後から直せば、過去のズレもその場で読み直る
 *  ・3つのズレは意味が違うので混ぜない＝**時刻**（何時に始めたか）／**長さ**（何分かかったか）／**日**（どの日にやったか）
 *    予定 8:00 の用を 2日後の 8:30 にやったら「時刻 30分おそい」かつ「2日おくれ」＝どちらも事実。足して1つにしない
 *  ・片方しか無ければ null＝「ズレは分からない」。0（ちょうど）とは別物。分からない数字は作らない
 *  ・🚫 やらなかった 記録は比べない＝やらなかったことに「遅れ」も「早い」も無い
 */
import type { Entry, Minute } from './types';
import { planDurationOf, actualDurationOf } from './slots';
import { daysBetween } from './dates';

/** ＋＝予定より後ろ（おそい・ながい・おくれ）／ー＝予定より前（はやい・みじかい）／0＝ちょうど／null＝分からない */
export interface Gap {
  start: Minute | null; // 時刻のズレ（分）＝実際の始まり − 予定の始まり
  dur: Minute | null;   // 長さのズレ（分）＝実際の長さ − 予定の長さ
  days: number | null;  // 日のズレ（日）＝実際にやった日 − やる予定の日
}

export type GapInput = Pick<Entry, 'date' | 'planStart' | 'planEnd' | 'planDur' | 'actualDate' | 'actualStart' | 'actualEnd' | 'actualDur' | 'skippedAt'>;

const NONE: Gap = { start: null, dur: null, days: null };

export function gapOf(e: GapInput): Gap {
  if (e.skippedAt) return NONE;
  const pd = planDurationOf(e), ad = actualDurationOf(e);
  return {
    start: e.planStart != null && e.actualStart != null ? e.actualStart - e.planStart : null,
    dur: pd != null && ad != null ? ad - pd : null,
    // 実際の日が空＝「予定の日にやった」ではなく「まだ分からない」。同じ日ならズレは無い＝出さない
    days: e.actualDate && e.actualDate !== e.date ? daysBetween(e.date, e.actualDate) : null,
  };
}

export type GapKind = keyof Gap;
/** ズレの言い方。種類で言葉が変わる（時刻は おそい／長さは ながい／日は おくれ） */
const WORDS: Record<GapKind, [string, string]> = { start: ['おそい', 'はやい'], dur: ['ながい', 'みじかい'], days: ['おくれ', 'はやい'] };

/** ズレ → 読める言葉。記号（＋ー）を使わずに書く＝符号の向きを覚えなくていい */
export function fmtGap(v: number | null, kind: GapKind): string {
  if (v == null) return '';
  if (v === 0) return 'ちょうど';
  const [pos, neg] = WORDS[kind];
  return `${Math.abs(v)}${kind === 'days' ? '日' : '分'}${v > 0 ? pos : neg}`;
}

/** 1件のズレを1行の言葉に（画面の行と 📝 振り返りで同じ言い方をするため、ここ1か所）。
 *  ⚠ ちょうど（0）は出さない＝毎行に「ちょうど」と書くと読みにくい。予定どおりかどうかは まとめの平均で見る
 *  withPrefix＝「予定より」を付けるか。予定と実際が並んで見えている画面の行では省く（狭い列で折り返すため）。
 *  📝 振り返りは列の助けが無いので付ける＝AI が何との差か迷わない */
export function gapLine(e: GapInput, withPrefix = true): string {
  const g = gapOf(e);
  return [g.start ? `${withPrefix ? '予定より' : ''}${fmtGap(g.start, 'start')}` : '', g.dur ? `長さ${fmtGap(g.dur, 'dur')}` : '', g.days ? fmtGap(g.days, 'days') : '']
    .filter(Boolean).join('・');
}

/** 何件ぶんかのズレをまとめた数。count＝ズレを出せた件数（予定と実際の両方があったもの）だけを見る */
export interface GapStats {
  count: number; // 比べられた件数
  avg: number;   // 平均のズレ（符号つき・分／日）
  late: number;  // 予定より後ろだった件数
  early: number; // 予定より前だった件数
  worst: number; // いちばん大きかったズレ（符号つき）
}
const ZERO: GapStats = { count: 0, avg: 0, late: 0, early: 0, worst: 0 };

function statsOf(vs: number[]): GapStats {
  if (!vs.length) return { ...ZERO };
  const sum = vs.reduce((a, b) => a + b, 0);
  const worst = vs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
  return { count: vs.length, avg: Math.round(sum / vs.length), late: vs.filter((v) => v > 0).length, early: vs.filter((v) => v < 0).length, worst };
}

/** 記録の束 → 3種類のズレのまとめ。⚠ 渡す束は呼ぶ側が決める（種目・期間で切るのは台帳の仕事） */
export function gapStats(entries: GapInput[]): Record<GapKind, GapStats> {
  const gs = entries.map(gapOf);
  const pick = (k: GapKind) => statsOf(gs.map((g) => g[k]).filter((v): v is number => v != null));
  return { start: pick('start'), dur: pick('dur'), days: pick('days') };
}

/** まとめの言い方＝「平均 11分おそい（7件・最大 45分おそい）」。ズレが無ければ空。
 *  ⚠ 1件のときは平均も最大も同じ数なので「最大」を書かない。全部ちょうどのときも同じ（同じ数を2回言わない） */
export function fmtGapStats(s: GapStats, kind: GapKind): string {
  if (!s.count) return '';
  if (s.count === 1) return `${fmtGap(s.worst, kind)}（1件）`;
  const head = s.avg === 0 ? '平均 ちょうど' : `平均 ${fmtGap(s.avg, kind)}`;
  return s.worst === 0 ? `${head}（${s.count}件）` : `${head}（${s.count}件・最大 ${fmtGap(s.worst, kind)}）`;
}
