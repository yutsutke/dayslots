import { describe, it, expect } from 'vitest';
import { gapOf, gapStats, fmtGap, fmtGapStats } from '../src/domain/gap';
import type { Entry } from '../src/domain/types';

type G = Pick<Entry, 'date' | 'planStart' | 'planEnd' | 'planDur' | 'actualDate' | 'actualStart' | 'actualEnd' | 'actualDur' | 'skippedAt'>;
const e = (p: Partial<G> = {}): G => ({
  date: '2026-09-18', planStart: null, planEnd: null, planDur: null,
  actualDate: null, actualStart: null, actualEnd: null, actualDur: null, skippedAt: null, ...p,
});
const hm = (h: number, m = 0) => h * 60 + m;

describe('ズレ＝予定と実際の差（読むときに引く）', () => {
  it('時刻のズレ＝実際の始まり − 予定の始まり', () => {
    expect(gapOf(e({ planStart: hm(6, 30), actualStart: hm(6, 41) })).start).toBe(11);
    expect(gapOf(e({ planStart: hm(6, 30), actualStart: hm(6, 25) })).start).toBe(-5);
  });

  it('長さのズレ＝実際の長さ − 予定の長さ（書いた「何分」が勝つ規則をそのまま引き継ぐ）', () => {
    expect(gapOf(e({ planStart: hm(6), planEnd: hm(6, 30), actualStart: hm(6), actualEnd: hm(6, 45) })).dur).toBe(15);
    expect(gapOf(e({ planDur: 30, actualDur: 20 })).dur).toBe(-10);
    // 始まり〜終わりがあっても、書いた長さが勝つ（slots.ts の決まり）
    expect(gapOf(e({ planDur: 30, actualStart: hm(6), actualEnd: hm(7), actualDur: 25 })).dur).toBe(-5);
  });

  it('日のズレ＝実際にやった日 − やる予定の日（＝先送りの痕跡はもう記録されている）', () => {
    expect(gapOf(e({ date: '2026-09-18', actualDate: '2026-09-20' })).days).toBe(2);
    expect(gapOf(e({ date: '2026-09-18', actualDate: '2026-09-17' })).days).toBe(-1);
  });

  it('日をまたいでも、時刻のズレと日のズレは別々に出る（意味が違うものを混ぜない）', () => {
    const g = gapOf(e({ date: '2026-09-18', planStart: hm(8), actualDate: '2026-09-20', actualStart: hm(8, 30) }));
    expect(g).toMatchObject({ start: 30, days: 2 });
  });

  it('ちょうど（0）は「分からない」ではない＝0 を返す', () => {
    expect(gapOf(e({ planStart: hm(8), actualStart: hm(8) })).start).toBe(0);
    expect(fmtGap(0, 'start')).toBe('ちょうど');
  });

  it('予定を後から直すと、過去のズレもその場で読み直る（ズレを保存していないから）', () => {
    const rec = e({ planStart: hm(6, 30), actualStart: hm(6, 41) });
    expect(gapOf(rec).start).toBe(11);
    expect(gapOf({ ...rec, planStart: hm(6, 45) }).start).toBe(-4); // 予定を 6:45 に直せば「4分はやい」に変わる
  });

  // ── 負のテスト（わざと足りない・矛盾した記録を渡す） ──
  it('片方しか無ければ null＝「ズレは分からない」。0 にしない', () => {
    expect(gapOf(e({ planStart: hm(8) })).start).toBeNull();          // 予定だけ＝まだやっていない
    expect(gapOf(e({ actualStart: hm(8) })).start).toBeNull();        // 実際だけ＝予定を置いていない
    expect(gapOf(e({ planDur: 30 })).dur).toBeNull();
    expect(gapOf(e({ actualDur: 30 })).dur).toBeNull();
  });

  it('実際の日が空なら 日のズレは null（「予定どおりの日にやった」と決めつけない）', () => {
    expect(gapOf(e({ date: '2026-09-18' })).days).toBeNull();
  });

  it('実際の日が予定の日と同じなら 日のズレは出さない（ズレていないものを 0 件として数えない）', () => {
    expect(gapOf(e({ date: '2026-09-18', actualDate: '2026-09-18' })).days).toBeNull();
  });

  it('🚫 やらなかった 記録は、実際の時刻が残っていても比べない', () => {
    const g = gapOf(e({ planStart: hm(8), actualStart: hm(9), planDur: 30, actualDur: 60, date: '2026-09-18', actualDate: '2026-09-20', skippedAt: '2026-09-18T10:00:00Z' }));
    expect(g).toEqual({ start: null, dur: null, days: null });
  });
});

describe('ズレのまとめ', () => {
  const es = [
    e({ planStart: hm(6, 30), actualStart: hm(6, 41) }), // +11
    e({ planStart: hm(6, 30), actualStart: hm(6, 35) }), // +5
    e({ planStart: hm(6, 30), actualStart: hm(6, 20) }), // -10
    e({ planStart: hm(6, 30) }),                          // 分からない＝数えない
    e({ actualStart: hm(6, 30) }),                        // 分からない＝数えない
  ];

  it('平均・件数・遅れ／早い・最大を出す（比べられたものだけ）', () => {
    // +11／+5／−10 ＝ 平均 +2・遅れ2件・早い1件。最大は**どちら向きでもいちばん大きいズレ**＝ +11
    expect(gapStats(es).start).toEqual({ count: 3, avg: 2, late: 2, early: 1, worst: 11 });
  });

  it('比べられる記録が1件も無ければ、まとめは空（0件）', () => {
    expect(gapStats([e({ planStart: hm(8) })]).start).toMatchObject({ count: 0 });
    expect(fmtGapStats(gapStats([]).start, 'start')).toBe('');
  });

  it('言い方＝符号を覚えなくていい日本語にする', () => {
    expect(fmtGap(11, 'start')).toBe('11分おそい');
    expect(fmtGap(-5, 'start')).toBe('5分はやい');
    expect(fmtGap(15, 'dur')).toBe('15分ながい');
    expect(fmtGap(-15, 'dur')).toBe('15分みじかい');
    expect(fmtGap(2, 'days')).toBe('2日おくれ');
    expect(fmtGap(null, 'start')).toBe('');
    expect(fmtGapStats(gapStats(es).start, 'start')).toBe('平均 2分おそい（3件・最大 11分おそい）');
  });

  it('同じ数を2回言わない＝1件のときと、全部ちょうどのときは「最大」を書かない', () => {
    const one = [e({ planStart: hm(6, 30), actualStart: hm(6, 35) })];
    expect(fmtGapStats(gapStats(one).start, 'start')).toBe('5分おそい（1件）');
    const allOnTime = [e({ planDur: 30, actualDur: 30 }), e({ planDur: 20, actualDur: 20 })];
    expect(fmtGapStats(gapStats(allOnTime).dur, 'dur')).toBe('平均 ちょうど（2件）');
  });
});
