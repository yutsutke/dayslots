import { describe, it, expect } from 'vitest';
import { viewDateOf, viewToday, dayStartLabel, switchMinute, MIDNIGHT } from '../src/domain/viewday';
import { Repo } from '../src/app/repo';
import { MemoryStore } from '../src/store/store';
import { seedDb } from '../src/store/seed';
import { setSunPlace } from '../src/domain/slots';

const TOKYO = { lat: 35.68, lon: 139.77, tzMin: 540 };
const RISE = { base: 'sunrise', offsetMin: 0 } as const, SET = { base: 'sunset', offsetMin: 0 } as const;

describe('1日の始まり＝日の出／日の入り（どの日に見せるか）', () => {
  it('0:00 始まりは暦の日のまま', () => {
    expect(viewDateOf('2026-09-20', 180, MIDNIGHT, TOKYO)).toBe('2026-09-20');
    expect(switchMinute('2026-09-20', MIDNIGHT, TOKYO)).toBeNull();
  });
  it('日の出始まり＝日の出（05:25 ごろ）より前は前の日。以後はその日', () => {
    expect(viewDateOf('2026-09-20', 3 * 60, RISE, TOKYO)).toBe('2026-09-19');
    expect(viewDateOf('2026-09-20', 5 * 60 + 20, RISE, TOKYO)).toBe('2026-09-19');
    expect(viewDateOf('2026-09-20', 5 * 60 + 30, RISE, TOKYO)).toBe('2026-09-20');
    expect(viewDateOf('2026-09-20', 23 * 60, RISE, TOKYO)).toBe('2026-09-20');
  });
  it('日の入り始まり＝日の入り（17:45 ごろ）以後は次の日', () => {
    expect(viewDateOf('2026-09-20', 17 * 60 + 30, SET, TOKYO)).toBe('2026-09-20');
    expect(viewDateOf('2026-09-20', 18 * 60, SET, TOKYO)).toBe('2026-09-21');
  });
  it('ずらし（日の出の30分前から新しい日）・時刻の無い記録は動かさない・季節で変わる', () => {
    expect(viewDateOf('2026-09-20', 5 * 60, { base: 'sunrise', offsetMin: -30 }, TOKYO)).toBe('2026-09-20');
    expect(viewDateOf('2026-09-20', null, RISE, TOKYO)).toBe('2026-09-20');
    expect(viewDateOf('2026-12-22', 6 * 60, RISE, TOKYO)).toBe('2026-12-21'); // 冬の 6:00 はまだ日の出前
    expect(viewDateOf('2026-06-21', 6 * 60, RISE, TOKYO)).toBe('2026-06-21');
  });
  it('いまは「どの日」か＝未明はまだ前の日（日の出始まり）', () => {
    expect(viewToday(RISE, TOKYO, new Date(2026, 8, 20, 3, 0))).toBe('2026-09-19');
    expect(viewToday(RISE, TOKYO, new Date(2026, 8, 20, 9, 0))).toBe('2026-09-20');
    expect(dayStartLabel('2026-09-20', RISE, TOKYO)).toMatch(/^🌅05:2\d〜$/);
    expect(dayStartLabel('2026-09-20', SET, TOKYO)).toMatch(/^🌇前日17:4\d〜$/);
    expect(dayStartLabel('2026-09-20', MIDNIGHT, TOKYO)).toBe('');
  });
});

describe('台帳＝見せる日で期間を切る（記録は書き換えない）', () => {
  const TODAY = '2026-09-20';
  const open = () => Repo.open(new MemoryStore(), () => seedDb(TODAY), () => TODAY);
  it('日の出始まりにすると、未明 3:00 の散歩は前の日のぶんとして返る。0:00 に戻せば元どおり', async () => {
    setSunPlace(TOKYO);
    const r = await open();
    const e = r.addEntry('t-act', { title: '夜更けの散歩', date: '2026-09-20', actualDate: '2026-09-20', actualStart: 180, planStart: 180 });
    expect(r.entriesFor('t-act', '2026-09-19', '2026-09-19').some((x) => x.id === e.id)).toBe(false);
    r.db.settings.dayStart = { base: 'sunrise', offsetMin: 0 };
    expect(r.viewDate(e)).toBe('2026-09-19');
    expect(r.entriesFor('t-act', '2026-09-19', '2026-09-19').some((x) => x.id === e.id)).toBe(true);
    expect(r.entriesFor('t-act', '2026-09-20', '2026-09-20').some((x) => x.id === e.id)).toBe(false);
    expect(e.date).toBe('2026-09-20');                                  // 暦の日付はそのまま
    r.db.settings.dayStart = { base: 'midnight' };
    expect(r.entriesFor('t-act', '2026-09-20', '2026-09-20').some((x) => x.id === e.id)).toBe(true);
    setSunPlace(null);
  });
  it('日の入り始まり＝夜の「明日のこと 20:40」は次の日のぶんになる。🔁 の回は二重に作られない', async () => {
    setSunPlace(TOKYO);
    const r = await open();
    r.db.settings.dayStart = { base: 'sunset', offsetMin: 0 };
    r.ensureAuto('2026-09-19', '2026-09-20'); const n = r.db.entries.length;
    r.ensureAuto('2026-09-19', '2026-09-20'); expect(r.db.entries.length).toBe(n);
    const night = r.db.entries.find((x) => x.title === '明日のこと' && x.date === '2026-09-19')!;
    expect(r.viewDate(night)).toBe('2026-09-20');
    setSunPlace(null);
  });
});
