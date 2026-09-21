import { describe, it, expect } from 'vitest';
import { spanRange, spanWeeks, spanStats, SPANS, SPAN_LABEL } from '../src/domain/span';
import { dowOf, daysBetween } from '../src/domain/dates';

const ANCHOR = '2026-09-21'; // 月曜

describe('📆 長い期間の窓（週に揃える）', () => {
  it('3つそろっている＝3か月・半年・1年', () => {
    expect([...SPANS]).toEqual([3, 6, 12]);
    expect(SPANS.map((m) => SPAN_LABEL[m])).toEqual(['3か月', '半年', '1年']);
  });

  it('窓の両端はいつも週の頭と週の終わり＝升目の端が半端にならない', () => {
    for (const ws of [0, 1] as const) for (const m of SPANS) {
      const [from, to] = spanRange(ANCHOR, m, ws);
      expect(dowOf(from)).toBe(ws);                 // 頭は 週の始まり
      expect(dowOf(to)).toBe((ws + 6) % 7);         // 終わりはその6日後
      expect((daysBetween(from, to) + 1) % 7).toBe(0);
    }
  });

  it('週の数＝だいたい 13／26／53（月の長さで1週ぶれる）', () => {
    const w = SPANS.map((m) => spanWeeks(...spanRange(ANCHOR, m, 0)));
    expect(w[0]).toBeGreaterThanOrEqual(13); expect(w[0]).toBeLessThanOrEqual(14);
    expect(w[1]).toBeGreaterThanOrEqual(26); expect(w[1]).toBeLessThanOrEqual(28);
    expect(w[2]).toBeGreaterThanOrEqual(53); expect(w[2]).toBeLessThanOrEqual(54);
  });

  it('終わりは基準日を含む週の終わり＝その週まで見せる', () => {
    const [, to] = spanRange(ANCHOR, 3, 0);
    expect(to >= ANCHOR).toBe(true);
    expect(daysBetween(ANCHOR, to)).toBeLessThan(7);
  });

  it('週の始まりが日曜でも月曜でも揃う', () => {
    expect(dowOf(spanRange(ANCHOR, 3, 0)[0])).toBe(0);
    expect(dowOf(spanRange(ANCHOR, 3, 1)[0])).toBe(1);
  });
});

describe('たまにしかやらないことを読む数', () => {
  const today = '2026-09-21';

  it('やった日数・最後の日・そこから何日', () => {
    const s = spanStats(['2026-07-05', '2026-08-02', '2026-09-18'], today);
    expect(s.days).toBe(3);
    expect(s.last).toBe('2026-09-18');
    expect(s.sinceLast).toBe(3);
  });

  it('だいたい何日に1回＝最初から最後までを、間の数で割る', () => {
    // 7/5 → 9/18 は 75日・間は2つ ＝ 約38日に1回
    expect(spanStats(['2026-07-05', '2026-08-02', '2026-09-18'], today).avgGap).toBe(38);
  });

  it('いちばん空いた間隔', () => {
    expect(spanStats(['2026-07-05', '2026-08-02', '2026-09-18'], today).maxGap).toBe(47);
  });

  it('順番がばらばらでも・同じ日が重なっていても同じ答え', () => {
    const a = spanStats(['2026-09-18', '2026-07-05', '2026-08-02'], today);
    const b = spanStats(['2026-07-05', '2026-07-05', '2026-08-02', '2026-09-18', '2026-09-18'], today);
    expect(a).toEqual(b);
  });

  // ── 負のテスト ──
  it('1日も無ければ、すべて「分からない」（0 でごまかさない）', () => {
    expect(spanStats([], today)).toEqual({ days: 0, last: null, sinceLast: null, avgGap: null, maxGap: null });
  });

  it('やった日が1日だけなら「何日に1回」は出せない＝間が無いから', () => {
    const s = spanStats(['2026-09-18'], today);
    expect(s).toMatchObject({ days: 1, last: '2026-09-18', sinceLast: 3, avgGap: null, maxGap: null });
  });

  it('今日やっていれば 0日前（null ではない）', () => {
    expect(spanStats([today], today).sinceLast).toBe(0);
  });
});
