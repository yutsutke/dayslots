import { describe, it, expect } from 'vitest';
import { cycleStart, cycleEnd, cycleIndex, validateCycle, MIN_CYCLE, MAX_CYCLE } from '../src/domain/cycle';

const FROM = '2026-09-20'; // 数え始める日

describe('N日のひと区切り（サイクル）', () => {
  it('基準日を含む区切りが1周目＝初日は基準日そのもの', () => {
    expect(cycleStart(FROM, FROM, 3)).toBe('2026-09-20');
    expect(cycleEnd(FROM, FROM, 3)).toBe('2026-09-22');
    expect(cycleIndex(FROM, FROM, 3)).toBe(1);
  });

  it('区切りの中のどの日でも、同じ初日・同じ周になる', () => {
    for (const d of ['2026-09-20', '2026-09-21', '2026-09-22']) {
      expect(cycleStart(d, FROM, 3)).toBe('2026-09-20');
      expect(cycleIndex(d, FROM, 3)).toBe(1);
    }
    expect(cycleStart('2026-09-23', FROM, 3)).toBe('2026-09-23'); // 次の区切りへ
    expect(cycleIndex('2026-09-23', FROM, 3)).toBe(2);
  });

  it('10日のひと区切り', () => {
    expect(cycleStart('2026-09-29', FROM, 10)).toBe('2026-09-20');
    expect(cycleEnd('2026-09-29', FROM, 10)).toBe('2026-09-29');
    expect(cycleIndex('2026-09-30', FROM, 10)).toBe(2);
    expect(cycleStart('2026-09-30', FROM, 10)).toBe('2026-09-30');
  });

  it('基準日より前も同じ幅で切れる（0周目・-1周目…）＝途中から数え始めても過去が崩れない', () => {
    expect(cycleStart('2026-09-19', FROM, 3)).toBe('2026-09-17');
    expect(cycleIndex('2026-09-19', FROM, 3)).toBe(0);
    expect(cycleStart('2026-09-17', FROM, 3)).toBe('2026-09-17');
    expect(cycleIndex('2026-09-16', FROM, 3)).toBe(-1);
    expect(cycleEnd('2026-09-16', FROM, 3)).toBe('2026-09-16');
  });

  it('月をまたいでも幅が崩れない（暦の月・曜日とは無関係に数える）', () => {
    expect(cycleStart('2026-10-01', FROM, 3)).toBe('2026-09-29'); // 9/29・30・10/1
    expect(cycleEnd('2026-10-01', FROM, 3)).toBe('2026-10-01');
    expect(cycleIndex('2026-10-01', FROM, 3)).toBe(4);
  });

  it('1日ずつ進めると、ちょうど N日ごとに周が変わる', () => {
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      const d = `2026-09-${String(20 + i).padStart(2, '0')}`;
      seen.push(cycleIndex(d, FROM, 4));
    }
    expect(seen).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
  });

  it('区切りの初日〜最終日は、ちょうど N日ある', () => {
    for (const n of [2, 3, 5, 7, 10, 31]) {
      const a = cycleStart('2026-11-05', FROM, n), b = cycleEnd('2026-11-05', FROM, n);
      const diff = (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;
      expect(diff + 1).toBe(n);
    }
  });

  it('数え始める日を変えると、同じ日が別の区切りに読み直る（記録は書き換えない）', () => {
    expect(cycleStart('2026-09-25', '2026-09-20', 3)).toBe('2026-09-23');
    expect(cycleStart('2026-09-25', '2026-09-21', 3)).toBe('2026-09-24'); // 基準日を1日ずらしただけ
  });

  // ── 負のテスト ──
  it('日数が範囲の外・日付の書き方が違うものは断る', () => {
    expect(validateCycle(1, FROM)).toHaveLength(1);
    expect(validateCycle(MAX_CYCLE + 1, FROM)).toHaveLength(1);
    expect(validateCycle(3.5, FROM)).toHaveLength(1);
    expect(validateCycle(3, '2026/09/20')).toHaveLength(1);
    expect(validateCycle(1, 'きのう')).toHaveLength(2);
  });

  it('通る設定はエラーが空', () => {
    expect(validateCycle(MIN_CYCLE, FROM)).toEqual([]);
    expect(validateCycle(MAX_CYCLE, FROM)).toEqual([]);
    expect(validateCycle(10, '2026-01-01')).toEqual([]);
  });
});
