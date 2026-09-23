import { describe, it, expect } from 'vitest';
import { marksOn, rowOf, rowsOf, calDiff, calText, logDay, checkMilestone, type Milestone } from '../src/domain/milestones';
import { fromRaw } from '../src/sync/milestones';

const ms = (id: number, date: string, more: Partial<Milestone> = {}): Milestone => ({ id, title: `m${id}`, date, time: null, note: null, label: null, reminders: [], photoCount: 0, ...more });
const labels = (d: string, list: Milestone[]) => marksOn(d, list).map((x) => `${x.kind}:${x.title}:${x.label}`);

describe('🗓 節目（ライフログと同じ＝元の記念日から一直線）', () => {
  it('過去の記念日＝最初の年の 1/3/6ヶ月だけ。「前」は出ない', () => {
    const m = ms(1, '2020-01-15');
    expect(labels('2020-02-15', [m])).toEqual(['mark:m1:1ヶ月']);
    expect(labels('2020-04-15', [m])).toEqual(['mark:m1:3ヶ月']);
    expect(labels('2020-07-15', [m])).toEqual(['mark:m1:6ヶ月']);
    expect(labels('2021-01-15', [m])).toEqual([]); // 周年そのものは節目ではない
    expect(labels('2019-12-15', [m])).toEqual(['mark:m1:1ヶ月前']); // 記念日より前の日なら前も出る（一直線）
  });
  it('未来の記念日＝N年前・Nヶ月前のカウントダウン', () => {
    const m = ms(2, '2026-12-29');
    expect(labels('2026-06-29', [m])).toEqual(['mark:m2:6ヶ月前']);
    expect(labels('2025-12-29', [m])).toEqual(['mark:m2:1年前']);
  });
  it('月末は寄せる（1/31 の1ヶ月後＝2/28）', () => {
    expect(labels('2026-02-28', [ms(3, '2026-01-31')])).toEqual(['mark:m3:1ヶ月']);
  });
});

describe('🔔 リマインダー（毎年くりかえす）', () => {
  it('過去の記念日でも毎年＝次に来る周年から逆算', () => {
    const m = ms(4, '1976-11-05', { reminders: [{ u: 'm', n: 1 }, { u: 'w', n: 1 }] });
    expect(labels('2026-10-05', [m])).toEqual(['remind:m4:1ヶ月前']);
    expect(labels('2026-10-29', [m])).toEqual(['remind:m4:1週間前']);
    expect(labels('2027-10-29', [m])).toEqual(['remind:m4:1週間前']);
  });
  it('年をまたぐ（1/3 の1週間前＝前の年の 12/27）', () => {
    expect(labels('2026-12-27', [ms(5, '2000-01-03', { reminders: [{ u: 'w', n: 1 }] })])).toEqual(['remind:m5:1週間前']);
  });
  it('同じ記念日・同じ言葉の節目とは二重に出さない', () => {
    const m = ms(6, '2026-12-29', { reminders: [{ u: 'm', n: 1 }] });
    expect(labels('2026-11-29', [m])).toEqual(['remind:m6:1ヶ月前']);
  });
  it('2/29 の記念日は平年なら 2/28 を周年にする（無い日付を作らない）', () => {
    expect(labels('2027-02-27', [ms(7, '2024-02-29', { reminders: [{ u: 'd', n: 1 }] })])).toEqual(['remind:m7:1日前']);
  });
});

describe('一覧＝N日目／あとN日・次の周年（保存しない・数えるだけ）', () => {
  it('過去＝N日目・年月日・次の周年まで', () => {
    const r = rowOf(ms(1, '2020-09-20'), '2026-09-23');
    expect(r.days).toBe(2194); expect(r.cal).toBe('6年3日');
    expect(r.nextAnniv).toBe('2027-09-20'); expect(r.years).toBe(7); expect(r.untilNext).toBe(362);
  });
  it('今日が周年＝あと0日', () => {
    const r = rowOf(ms(1, '2020-09-23'), '2026-09-23');
    expect(r.untilNext).toBe(0); expect(r.years).toBe(6);
  });
  it('未来＝あとN日（days が負）・次はその日そのもの', () => {
    const r = rowOf(ms(1, '2026-12-29'), '2026-09-23');
    expect(r.days).toBe(-97); expect(r.nextAnniv).toBe('2026-12-29'); expect(r.untilNext).toBe(97); expect(r.cal).toBe('3ヶ月6日');
  });
  it('並びは次に来る順', () => {
    expect(rowsOf([ms(1, '2000-01-01'), ms(2, '2000-10-01'), ms(3, '2000-09-23')], '2026-09-23').map((r) => r.m.id)).toEqual([3, 2, 1]);
  });
  it('年月日の差＝前の月の日数を借りる', () => {
    expect(calText(calDiff('2026-01-31', '2026-03-01'))).toBe('1ヶ月1日');
    expect(calText(calDiff('2026-09-23', '2026-09-23'))).toBe('0日');
  });
  it('記録ログは記念日の当日が 0日目', () => {
    expect(logDay(ms(1, '2026-09-01'), { id: 1, milestoneId: 1, date: '2026-09-11', note: null, photoCount: 0 })).toBe(10);
  });
});

describe('送る前の検査・返事の読み方', () => {
  it('名前・日付・時刻・リマインダーの形が悪ければ止める', () => {
    expect(checkMilestone({ title: ' ', date: '2026-01-01' })).not.toBeNull();
    expect(checkMilestone({ title: 'a', date: '' })).not.toBeNull();
    expect(checkMilestone({ title: 'a', date: '2026-01-01', time: '9時' })).not.toBeNull();
    expect(checkMilestone({ title: 'a', date: '2026-01-01', reminders: [{ u: 'w', n: 0 }] })).not.toBeNull();
    expect(checkMilestone({ title: 'a', date: '2026-01-01', time: '09:30', reminders: [{ u: 'm', n: 1 }] })).toBeNull();
  });
  it('関数の返事＝時刻は HH:MM に・形の合わないリマインダーは捨てる・写真は数だけ', () => {
    const m = fromRaw({ id: 9, title: 't', event_date: '2020-01-01', event_time: '09:30:00', note: null, label: '旅行', reminders: [{ u: 'w', n: 1 }, { u: 'x', n: 2 }, null], photo_count: 3 });
    expect(m).toEqual({ id: 9, title: 't', date: '2020-01-01', time: '09:30', note: null, label: '旅行', reminders: [{ u: 'w', n: 1 }], photoCount: 3 });
  });
});
