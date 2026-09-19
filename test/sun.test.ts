import { describe, it, expect } from 'vitest';
import { sunTimes, sunMinute, describeSun } from '../src/domain/sun';
import { PRESETS } from '../src/domain/defaults';
import { bucketOf, slotOfMinute, slotRange, startOf, setSunPlace, validateSlots } from '../src/domain/slots';
import type { Track } from '../src/domain/types';

const TOKYO = { lat: 35.68, lon: 139.77, tzMin: 540 };
const near = (a: number, b: number, tol = 5) => Math.abs(a - b) <= tol;

describe('☀ 日の出・日の入り（東京・5分刻み）', () => {
  it('秋分のころ＝日の出 5:27 ごろ・日の入り 17:41 ごろ', () => {
    const t = sunTimes('2026-09-20', TOKYO)!;
    expect(near(t.rise, 5 * 60 + 27)).toBe(true); expect(near(t.set, 17 * 60 + 41)).toBe(true);
    expect(t.rise % 5).toBe(0); expect(t.set % 5).toBe(0);
  });
  it('夏至と冬至で大きく動く（4:25 ごろ／6:47 ごろ）', () => {
    expect(near(sunTimes('2026-06-21', TOKYO)!.rise, 4 * 60 + 25)).toBe(true);
    expect(near(sunTimes('2026-12-22', TOKYO)!.rise, 6 * 60 + 47)).toBe(true);
    expect(near(sunTimes('2026-12-22', TOKYO)!.set, 16 * 60 + 32)).toBe(true);
  });
  it('日の出の30分前／昼を3等分', () => {
    const t = sunTimes('2026-09-20', TOKYO)!;
    expect(near(sunMinute({ base: 'sunrise', offsetMin: -30 }, '2026-09-20', TOKYO)!, t.rise - 30)).toBe(true);
    const a = sunMinute({ base: 'daylight', num: 1, den: 3 }, '2026-09-20', TOKYO)!, b = sunMinute({ base: 'daylight', num: 2, den: 3 }, '2026-09-20', TOKYO)!;
    expect(near(a, t.rise + (t.set - t.rise) / 3, 6)).toBe(true); expect(near(b, t.rise + ((t.set - t.rise) * 2) / 3, 6)).toBe(true);
    expect(a % 5).toBe(0);
    expect(describeSun({ base: 'sunrise', offsetMin: -30 })).toBe('日の出の30分前');
    expect(describeSun({ base: 'daylight', num: 1, den: 3 })).toBe('昼を3等分の1つ目');
  });
  it('白夜・極夜では null（呼び手は素の時刻に戻る）', () => {
    expect(sunTimes('2026-06-21', { lat: 78, lon: 15, tzMin: 120 })).toBeNull();
  });
});

describe('☀ で決まる枡の境目', () => {
  const mk = (): Track => {
    const t: Track = { ...structuredClone(PRESETS.activity), id: 't', sortOrder: 0, archived: false };
    t.slots = [
      { key: 'none', label: '時間帯なし', icon: '', startMin: null },
      { key: 'night', label: '夜明け前', icon: '🌌', startMin: 0 },
      { key: 'dawn', label: '朝', icon: '🌅', startMin: 300, sun: { base: 'sunrise', offsetMin: -30 } },
      { key: 'mid', label: '昼', icon: '☀️', startMin: 600, sun: { base: 'daylight', num: 1, den: 3 } },
      { key: 'late', label: '午後', icon: '🌇', startMin: 840, sun: { base: 'daylight', num: 2, den: 3 } },
      { key: 'eve', label: '夜', icon: '🌙', startMin: 1080, sun: { base: 'sunset', offsetMin: 0 } },
    ];
    return t;
  };
  it('同じ 5:10 でも、夏は「朝」・冬は「夜明け前」＝その記録の日の太陽で決まる（記録は書き換えない）', () => {
    setSunPlace(TOKYO); const t = mk();
    const e = { slotKey: null, planStart: 5 * 60 + 10, actualStart: null };
    expect(bucketOf(t, { ...e, date: '2026-06-21' })).toBe('dawn');
    expect(bucketOf(t, { ...e, date: '2026-12-22' })).toBe('night');
    expect(slotOfMinute(t, 17 * 60, '2026-12-22')).toBe('eve');     // 冬の 17:00 はもう夜
    expect(slotOfMinute(t, 17 * 60, '2026-06-21')).toBe('late');    // 夏はまだ午後
  });
  it('見出しの範囲は日で変わる（≈ が付く）。人が選んだ枡は今までどおり勝つ', () => {
    setSunPlace(TOKYO); const t = mk();
    expect(slotRange(t, 'dawn', '2026-09-20')).toMatch(/^≈0[45]:\d5?\d〜/);
    expect(slotRange(t, 'dawn', '2026-06-21')).not.toBe(slotRange(t, 'dawn', '2026-12-22'));
    expect(bucketOf(t, { slotKey: 'eve', planStart: 300, actualStart: null, date: '2026-06-21' })).toBe('eve');
    expect(startOf(t.slots[0])).toBeNull();
  });
  it('場所を変えると境目も変わる（札幌の冬の日の入りは東京より早い）', () => {
    const t = mk();
    setSunPlace(TOKYO); const tokyo = startOf(t.slots[5], '2026-12-22')!;
    setSunPlace({ lat: 43.06, lon: 141.35, tzMin: 540 }); const sapporo = startOf(t.slots[5], '2026-12-22')!;
    expect(sapporo).toBeLessThan(tokyo);
    setSunPlace(null);
  });
  it('検査＝☀ の枡は通る。等分の数が変なら弾く', () => {
    const t = mk();
    expect(validateSlots(t.slots, 'none')).toEqual([]);
    t.slots[3].sun = { base: 'daylight', num: 5, den: 3 };
    expect(validateSlots(t.slots, 'none').join()).toMatch(/等分/);
  });
});
