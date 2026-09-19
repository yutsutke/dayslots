import { describe, it, expect } from 'vitest';
import { occurrences, isHoliday, jpHolidays } from '../src/domain/recur';
import type { Rule } from '../src/domain/types';

const rule = (p: Partial<Rule>): Rule => ({
  id: 'r', trackId: 't', title: 'x', note: null, payload: {}, templateId: null, freq: 'daily', byday: [], interval: null, half: null,
  dayFrom: null, dayTo: null, startDate: '2026-09-01', endDate: null, slotKey: null, planStart: null, planEnd: null, priority: 0, tag: null,
  auto: false, active: true, calendar: false, exceptions: {}, sortOrder: 0, createdAt: '', updatedAt: '', ...p,
});
const dates = (rs: Rule[], from: string, to: string, hol: string[] = []) => occurrences(rs, from, to, hol).map((o) => o.date);

describe('🔁 繰り返しの展開（ライフログの規則を写した）', () => {
  it('日本の祝日（2026）＝敬老の日 9/21・秋分 9/23・挟まれた 9/22 は国民の休日（＝9/19〜9/23 が5連休）', () => {
    const s = jpHolidays(2026);
    expect(s.has('2026-09-21')).toBe(true);
    expect(s.has('2026-09-23')).toBe(true);
    expect(s.has('2026-09-22')).toBe(true);
    expect(s.has('2026-09-24')).toBe(false);
  });
  it('毎日＝窓の中の全日。始まりより前・終わりより後は出ない', () => {
    expect(dates([rule({ startDate: '2026-09-15', endDate: '2026-09-17' })], '2026-09-13', '2026-09-19')).toEqual(['2026-09-15', '2026-09-16', '2026-09-17']);
  });
  it('毎週（月・水・金）', () => {
    expect(dates([rule({ freq: 'weekly', byday: [1, 3, 5] })], '2026-09-13', '2026-09-19')).toEqual(['2026-09-14', '2026-09-16', '2026-09-18']);
  });
  it('N日ごと＝始まりの日から数える（窓の途中から始まっても位相がずれない）', () => {
    expect(dates([rule({ freq: 'everyN', interval: 3, startDate: '2026-09-01' })], '2026-09-13', '2026-09-19')).toEqual(['2026-09-13', '2026-09-16', '2026-09-19']);
  });
  it('毎月（同じ日）＝無い月は月末に寄せる（1/31 → 2/28）', () => {
    expect(dates([rule({ freq: 'monthly', startDate: '2026-01-31' })], '2026-02-01', '2026-03-31')).toEqual(['2026-02-28', '2026-03-31']);
  });
  it('月の後半＝帯（16日〜月末）。窓に少しでも掛かれば出る', () => {
    const o = occurrences([rule({ freq: 'monthhalf', half: 'second', startDate: '2026-01-01' })], '2026-09-13', '2026-09-19');
    expect(o).toHaveLength(1); expect(o[0].date).toBe('2026-09-16'); expect(o[0].end).toBe('2026-09-30'); expect(o[0].multi).toBe(true);
  });
  it('毎月 N日〜M日＝月末を超えたら月末に寄せる', () => {
    const o = occurrences([rule({ freq: 'monthrange', dayFrom: 28, dayTo: 31, startDate: '2026-01-01' })], '2026-02-01', '2026-02-28');
    expect(o[0].date).toBe('2026-02-28'); expect(o[0].end).toBe('2026-02-28'); expect(o[0].multi).toBe(false);
  });
  it('週の最初の平日＝連休でずれる（9/21〜23 が休み → 9/24 木）', () => {
    expect(dates([rule({ freq: 'firstworkday' })], '2026-09-20', '2026-09-26')).toEqual(['2026-09-24']);
    expect(dates([rule({ freq: 'firstworkday' })], '2026-09-13', '2026-09-19')).toEqual(['2026-09-14']);
  });
  it('休日の前日＝翌日が休日の平日（金曜だけではない）。有給を足すとその前日も入る', () => {
    expect(dates([rule({ freq: 'beforeoff' })], '2026-09-14', '2026-09-18')).toEqual(['2026-09-18']);
    expect(dates([rule({ freq: 'beforeoff' })], '2026-09-14', '2026-09-18', ['2026-09-16'])).toEqual(['2026-09-15', '2026-09-18']);
  });
  it('本人が足した休み（有給）も休日として数える', () => {
    expect(isHoliday('2026-09-17', new Set(['2026-09-17']))).toBe(true);
    expect(isHoliday('2026-09-17', new Set())).toBe(false);
    expect(dates([rule({ freq: 'weekday' })], '2026-09-14', '2026-09-18', ['2026-09-17'])).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-18']);
  });
  it('連休の初日／最終日（9/19 土〜9/23 水の5連休）。1日だけの休みは初日でも最終日でもある（9/12 土〜13 日は2連休）', () => {
    expect(dates([rule({ freq: 'runstart' })], '2026-09-12', '2026-09-26')).toEqual(['2026-09-12', '2026-09-19', '2026-09-26']);
    expect(dates([rule({ freq: 'runend' })], '2026-09-12', '2026-09-25')).toEqual(['2026-09-13', '2026-09-23']);
  });
  it('例外（この回はなし）＝その日だけ出ない。この回だけ時刻を変えることもできる', () => {
    const r = rule({ planStart: 540, exceptions: { '2026-09-15': { del: true }, '2026-09-16': { planStart: 600, title: '別の名' } } });
    const o = occurrences([r], '2026-09-14', '2026-09-16');
    expect(o.map((x) => x.date)).toEqual(['2026-09-14', '2026-09-16']);
    expect(o[1].planStart).toBe(600); expect(o[1].title).toBe('別の名'); expect(o[0].planStart).toBe(540);
  });
  it('遠すぎる端（9999年）を渡されても固まらない＝窓は3年で切る（負のテスト）', () => {
    const t0 = Date.now();
    const n = occurrences([rule({})], '2026-09-01', '9999-12-31').length;
    expect(n).toBeGreaterThan(1000); expect(n).toBeLessThan(1200);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it('止めた規則（active=false）は出ない', () => {
    expect(dates([rule({ active: false })], '2026-09-13', '2026-09-19')).toEqual([]);
  });
});
