import { describe, it, expect } from 'vitest';
import { Repo } from '../src/app/repo';
import { MemoryStore } from '../src/store/store';
import { seedDb } from '../src/store/seed';
import { sunMinute, sunTimes } from '../src/domain/sun';
import { PRESETS } from '../src/domain/defaults';
import { slotOfMinute, slotRange, setSunPlace, validateSlots, wraps, displaySlots } from '../src/domain/slots';
import type { Track } from '../src/domain/types';

const TODAY = '2026-09-17';
const open = () => Repo.open(new MemoryStore(), () => seedDb(TODAY), () => TODAY);
const TOKYO = { lat: 35.68, lon: 139.77, tzMin: 540 };

describe('▶ スタート／⏹ ストップ', () => {
  it('候補＝その種目の ⭐ いつもの。無ければ（一日一回も）種目の名前1つ', async () => {
    const r = await open();
    expect(r.candidates('t-zazen')).toEqual([{ title: '座禅', templateId: null }]);
    expect(r.candidates('t-todo')).toEqual([{ title: 'やること', templateId: null }]);          // ⭐ が無い
    expect(r.candidates('t-act').map((c) => c.title).sort()).toEqual(['ジム', '朝散歩']);      // 複数＝選んでから
  });
  it('候補が1つの種目は、選ばずにいまから計れる。⏹ でその種目のいちばん新しい進行中が止まる', async () => {
    const r = await open();
    const c = r.candidates('t-zazen')[0];
    const s = r.startNow('t-zazen', c.title, c.templateId, 360);
    expect(s.entry).toMatchObject({ title: '座禅', actualStart: 360, actualEnd: null }); expect(r.running('t-zazen')).toHaveLength(1);
    expect(r.stopLatest('t-zazen', 385)).toMatch(/座禅 を 06:25 に終了/);
    expect(s.entry).toMatchObject({ actualEnd: 385 }); expect(s.entry.doneAt).not.toBeNull();
    expect(r.stopLatest('t-zazen')).toBeNull();
  });
  it('名前に「30分」が入っていても解釈し直さない（合図の欄と違い、選んだ名前そのまま）', async () => {
    const r = await open();
    const e = r.startNow('t-act', '30分ジョグ', null, 600).entry;
    expect(e).toMatchObject({ title: '30分ジョグ', actualStart: 600 }); expect(e.actualDur ?? null).toBeNull();
  });
  it('「すべて」＝なに を決めずに計れる。最中に決めると進行中の記録に、メモも引き継ぐ', async () => {
    const r = await open();
    const { timer } = r.startTimer(600);
    expect(r.runningTimers()).toHaveLength(1);
    expect(r.applySignal('いい天気').kind).toBe('noted');                 // 進行中の計測に話しかける
    const e = r.assignTimer(timer.id, 't-act', '朝散歩', 'tp-walk');
    expect(e).toMatchObject({ trackId: 't-act', title: '朝散歩', templateId: 'tp-walk', actualStart: 600, actualEnd: null });
    expect(e.note).toMatch(/いい天気/); expect(r.isRunning(e)).toBe(true); expect(r.db.timers).toHaveLength(0);
  });
  it('計り終わってから決めてもよい＝始まり〜終わり の入った ✅ の記録になる。決めるまでは残る', async () => {
    const r = await open();
    const { timer } = r.startTimer(600);
    expect(r.stopLatest(undefined, 640)).toMatch(/なに未定/);
    expect(r.finishedTimers()).toHaveLength(1); expect(r.runningTimers()).toHaveLength(0);
    const e = r.assignTimer(timer.id, 't-zazen', '座禅');
    expect(e).toMatchObject({ actualStart: 600, actualEnd: 640, date: TODAY }); expect(e.doneAt).not.toBeNull();
    expect(r.finishedTimers()).toHaveLength(0);
  });
  it('次を始めると前が止まる＝なに未定の計測も同じ', async () => {
    const r = await open();
    r.startTimer(600);
    const s = r.startNow('t-zazen', '座禅', null, 630);
    expect(s.message).toMatch(/なに未定 を終了/);
    expect(r.finishedTimers()[0]).toMatchObject({ startMin: 600, endMin: 630 });
  });
});

describe('🌙 夜を等分する枡（0:00 をまたぐ）', () => {
  const mk = (): Track => {
    const t: Track = { ...structuredClone(PRESETS.activity), id: 't', sortOrder: 0, archived: false };
    t.slots = [
      { key: 'none', label: '時間帯なし', icon: '', startMin: null },
      { key: 'dawn', label: '朝', icon: '🌅', startMin: 300, sun: { base: 'sunrise', offsetMin: -30 } },
      { key: 'eve', label: '夜', icon: '🌙', startMin: 1080, sun: { base: 'sunset', offsetMin: 0 } },
      { key: 'deep', label: '深夜', icon: '🌌', startMin: 1410, sun: { base: 'night', num: 1, den: 2 } },
    ];
    return t;
  };
  it('夜の真ん中＝日の入りと次の日の出のちょうど間（秋分ごろの東京で 23:35 前後）', () => {
    const t = sunTimes('2026-09-20', TOKYO)!; const next = sunTimes('2026-09-21', TOKYO)!;
    const mid = sunMinute({ base: 'night', num: 1, den: 2 }, '2026-09-20', TOKYO)!;
    expect(Math.abs(mid - (t.set + (1440 - t.set + next.rise) / 2))).toBeLessThanOrEqual(5);
    expect(mid % 5).toBe(0);
  });
  it('境目が 0:00 を過ぎる等分は、未明の側に出る（夜を3等分の2つ目＝01:30 ごろ）', () => {
    const m = sunMinute({ base: 'night', num: 2, den: 3 }, '2026-09-20', TOKYO)!;
    expect(m).toBeGreaterThan(60); expect(m).toBeLessThan(150);
  });
  it('未明は「前の晩の枡の続き」＝受け皿に落ちない。見出しは「〜翌 04:55」', () => {
    setSunPlace(TOKYO); const t = mk();
    expect(wraps(t, '2026-09-20')).toBe(true);
    expect(slotOfMinute(t, 2 * 60, '2026-09-20')).toBe('deep');
    expect(slotOfMinute(t, 20 * 60, '2026-09-20')).toBe('eve');
    expect(slotOfMinute(t, 23 * 60 + 50, '2026-09-20')).toBe('deep');
    expect(slotRange(t, 'deep', '2026-09-20')).toMatch(/^≈23:\d\d〜翌04:5\d$/);
    expect(validateSlots(t.slots, 'none')).toEqual([]);
    setSunPlace(null);
  });
  it('升目の並び＝1日の始まりの枡から1周。時刻で決まらない枡は ⚙ の位置のまま', () => {
    setSunPlace(TOKYO); const t = mk();
    const keys = (sw: number | null) => displaySlots(t, '2026-09-20', sw).map((s) => s.key);
    expect(keys(null)).toEqual(['none', 'dawn', 'eve', 'deep']);                                   // 0:00 始まり＝⚙ の並びそのまま
    expect(keys(sunMinute({ base: 'sunset', offsetMin: 0 }, '2026-09-20', TOKYO))).toEqual(['none', 'eve', 'deep', 'dawn']);   // 日の入り始まり＝夜から
    expect(keys(sunMinute({ base: 'sunrise', offsetMin: 0 }, '2026-09-20', TOKYO))).toEqual(['none', 'dawn', 'eve', 'deep']);  // 日の出始まり＝朝から
    const meal: Track = { ...structuredClone(PRESETS.meal), id: 'm', sortOrder: 0, archived: false };
    expect(displaySlots(meal, '2026-09-20', 17 * 60 + 45).map((s) => s.key)).toEqual(['dinner', 'breakfast', 'lunch', 'snack']); // 間食は最後のまま
    setSunPlace(null);
  });
  it('☀ でない種目（食事）は今までどおり＝未明は受け皿の間食（負のテスト）', () => {
    const meal: Track = { ...structuredClone(PRESETS.meal), id: 'm', sortOrder: 0, archived: false };
    expect(wraps(meal)).toBe(false); expect(slotOfMinute(meal, 120)).toBe('snack');
  });
});
