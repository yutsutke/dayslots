import { describe, it, expect } from 'vitest';
import { marksOn, rowOf, rowsOf, calDiff, calText, logDay, checkMilestone, logTimeResolve, checkLogTime, logTimeText, logMinutes, type Milestone } from '../src/domain/milestones';
import { fromRaw, logFromRaw, logTimeOf, logBody } from '../src/sync/milestones';

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
    expect(logDay(ms(1, '2026-09-01'), { id: 1, milestoneId: 1, date: '2026-09-11', note: null, photoCount: 0, start: null, end: null, dur: null })).toBe(10);
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

describe('⏱ 記録ログの はじめ・おわり・かかった時間（v34＝ライフログの表の約束＝tdDurResolve と同じ規則）', () => {
  const R = (a: number | null, b: number | null, d: number | null) => logTimeResolve(a, b, d);
  it('長さが無ければ何も変えない', () => {
    expect(R(600, 630, null)).toEqual({ start: 600, end: 630, dur: null });
    expect(R(null, null, null)).toEqual({ start: null, end: null, dur: null });
  });
  it('長さだけ＝長さだけ残す（本番の 9/27「高尾山 … 2時間程度」の形）', () => {
    expect(R(null, null, 120)).toEqual({ start: null, end: null, dur: 120 });
  });
  it('はじめ＋長さ＝おわりを決めて長さは持たない／おわりだけ＋長さ＝はじめを決める', () => {
    expect(R(600, null, 120)).toEqual({ start: 600, end: 720, dur: null });
    expect(R(null, 720, 120)).toEqual({ start: 600, end: 720, dur: null });
  });
  it('はじめもおわりもあれば長さは持たない（表は同時に持てない）', () => {
    expect(R(600, 720, 180)).toEqual({ start: 600, end: 720, dur: null });
  });
  it('24:00 を越えるなら長さのまま・おわりより長い長さは はじめ を作らない', () => {
    expect(R(1400, null, 60)).toEqual({ start: 1400, end: null, dur: 60 });
    expect(R(null, 20, 45)).toEqual({ start: null, end: 20, dur: null });
    expect(R(1410, null, 30)).toEqual({ start: 1410, end: 1440, dur: null });
  });
  it('おわりが はじめ より前・同じは止める／長さは 1〜1440', () => {
    expect(checkLogTime({ start: 720, end: 600, dur: null })).not.toBeNull();
    expect(checkLogTime({ start: 600, end: 600, dur: null })).not.toBeNull();
    expect(checkLogTime({ start: null, end: null, dur: 2000 })).not.toBeNull();
    expect(checkLogTime({ start: 600, end: 720, dur: null })).toBeNull();
    expect(checkLogTime({ start: null, end: null, dur: null })).toBeNull();
  });
  it('言い方＝ライフログの一覧と同じ中身', () => {
    expect(logTimeText({ start: 480, end: 870, dur: null })).toBe('08:00〜14:30（6時間30分）');
    expect(logTimeText({ start: null, end: null, dur: 120 })).toBe('⏱2時間');
    expect(logTimeText({ start: 540, end: null, dur: null })).toBe('09:00〜');
    expect(logTimeText({ start: null, end: 1020, dur: null })).toBe('〜17:00');
    expect(logTimeText({ start: 1320, end: null, dur: 300 })).toBe('22:00〜 ⏱5時間');
    expect(logTimeText({ start: 1380, end: 1440, dur: null })).toBe('23:00〜24:00（1時間）');
    expect(logTimeText({ start: null, end: null, dur: null })).toBe('');
  });
  it('何分かけたか（数えるだけ）＝時刻の差 → 無ければ長さ → 無ければ null', () => {
    expect(logMinutes({ start: 600, end: 720, dur: null })).toBe(120);
    expect(logMinutes({ start: null, end: null, dur: 45 })).toBe(45);
    expect(logMinutes({ start: 600, end: null, dur: null })).toBeNull();
  });
});

describe('⏱ 関数の返事と本文（古い関数には時刻を送らない）', () => {
  it('新しい関数の行＝時刻を読む／古い関数の行（キーが無い）＝null', () => {
    expect(logFromRaw({ id: 1, milestone_id: 2, log_date: '2026-09-27', note: 'x', photo_count: 0, start_min: 600, end_min: 720, dur_min: null }))
      .toEqual({ id: 1, milestoneId: 2, date: '2026-09-27', note: 'x', photoCount: 0, start: 600, end: 720, dur: null });
    expect(logFromRaw({ id: 1, milestone_id: 2, log_date: '2026-09-27', note: 'x' })).toMatchObject({ start: null, end: null, dur: null });
  });
  it('版の見分け＝行に start_min のキーがあるか・行が無ければ分からない（null）', () => {
    expect(logTimeOf([{ id: 1, milestone_id: 2, log_date: 'd', note: null, start_min: null }])).toBe(true);
    expect(logTimeOf([{ id: 1, milestone_id: 2, log_date: 'd', note: null }])).toBe(false);
    expect(logTimeOf([])).toBeNull();
  });
  it('🚨 時刻を渡さなければキーごと送らない（関数は入っている時刻を消さない）・渡すなら3つとも（空は null で外す）', () => {
    expect(logBody({ milestoneId: 2, date: '2026-09-27', note: 'x' })).toEqual({ id: undefined, milestone_id: 2, log_date: '2026-09-27', note: 'x' });
    expect(logBody({ id: 5, milestoneId: 2, date: '2026-09-27', note: null, time: { start: null, end: null, dur: 120 } }))
      .toEqual({ id: 5, milestone_id: 2, log_date: '2026-09-27', note: null, start_min: null, end_min: null, dur_min: 120 });
  });
});

