import { describe, it, expect } from 'vitest';
import { PRESETS } from '../src/domain/defaults';
import { bucketOf, slotOfMinute, slotRange, validateSlots, durationOf, fmtDur } from '../src/domain/slots';
import type { Track } from '../src/domain/types';

const mk = (k: keyof typeof PRESETS): Track => ({ ...structuredClone(PRESETS[k]), id: k, sortOrder: 0, archived: false });
const todo = mk('todo'), meal = mk('meal');
const e = (p: Partial<{ slotKey: string | null; planStart: number | null; actualStart: number | null }>) => ({ slotKey: null, planStart: null, actualStart: null, ...p });

describe('枡の決め方（読むときに導く）', () => {
  it('時刻から枡が決まる（境目 11 / 14 / 17）', () => {
    expect(slotOfMinute(todo, 10 * 60 + 59)).toBe('morning');
    expect(slotOfMinute(todo, 11 * 60)).toBe('midday');
    expect(slotOfMinute(todo, 14 * 60)).toBe('afternoon');
    expect(slotOfMinute(todo, 23 * 60)).toBe('evening');
    expect(slotOfMinute(todo, 1440)).toBe('evening'); // 24:00 ちょうどは最後の枡
  });
  it('人が選んだ枡が時刻より勝つ', () => {
    expect(bucketOf(todo, e({ slotKey: 'afternoon', planStart: 9 * 60 }))).toBe('afternoon');
  });
  it('時刻も選択も無ければ受け皿（時間帯なし）', () => {
    expect(bucketOf(todo, e({}))).toBe('none');
  });
  it('種目から消えた枡の値は書き換えず、読むときに 時刻→受け皿 へ落ちる', () => {
    expect(bucketOf(todo, e({ slotKey: 'night' }))).toBe('none');
    expect(bucketOf(todo, e({ slotKey: 'night', planStart: 9 * 60 }))).toBe('morning');
  });
  it('境目を動かすと、同じ記録が別の枡に読み直る（記録は保存し直さない）', () => {
    const t = structuredClone(todo); const rec = e({ planStart: 11 * 60 + 30 });
    expect(bucketOf(t, rec)).toBe('midday');
    t.slots.find((s) => s.key === 'midday')!.startMin = 12 * 60;
    expect(bucketOf(t, rec)).toBe('morning');
  });
  it('枡を減らす・増やすと、列がそのまま変わる', () => {
    const t = structuredClone(todo);
    t.slots = t.slots.filter((s) => s.key !== 'midday');
    expect(slotOfMinute(t, 12 * 60)).toBe('morning');      // 昼を消したら 11〜14 は午前に吸われる
    t.slots.push({ key: 'late', label: '深夜', icon: '🌜', startMin: 22 * 60 });
    expect(slotOfMinute(t, 23 * 60)).toBe('late');
    expect(slotRange(t, 'evening')).toBe('17:00〜22:00');
  });
  it('食事＝実際の時刻が主。隙間（15:00〜16:30）と深夜（〜4:00）は受け皿の間食へ', () => {
    expect(bucketOf(meal, e({ actualStart: 7 * 60 + 30, planStart: 12 * 60 }))).toBe('breakfast');
    expect(slotOfMinute(meal, 15 * 60 + 30)).toBe('snack');
    expect(slotOfMinute(meal, 2 * 60)).toBe('snack');
    expect(slotOfMinute(meal, 14 * 60 + 59)).toBe('lunch');
    expect(slotOfMinute(meal, 20 * 60)).toBe('dinner');
  });
  it('見出しの範囲は境目から作る（手で書かない）', () => {
    expect(slotRange(todo, 'morning')).toBe('0:00〜11:00');
    expect(slotRange(todo, 'midday')).toBe('11:00〜14:00');
    expect(slotRange(todo, 'evening')).toBe('17:00〜24:00');
    expect(slotRange(meal, 'lunch')).toBe('10:30〜15:00');
    expect(slotRange(todo, 'none')).toBe('');
  });
});

describe('⏱ 何分やったか（時刻と無関係な長さの入力）', () => {
  const d = (p: Partial<{ planStart: number | null; planEnd: number | null; planDur: number | null; actualStart: number | null; actualEnd: number | null; actualDur: number | null }>) =>
    ({ planStart: null, planEnd: null, planDur: null, actualStart: null, actualEnd: null, actualDur: null, ...p });
  it('書いた長さが 始まり〜終わり より勝つ', () => {
    expect(durationOf(d({ actualStart: 600, actualEnd: 660, actualDur: 45 }))).toBe(45);
    expect(durationOf(d({ actualStart: 600, actualEnd: 660 }))).toBe(60);
  });
  it('実際が無ければ予定。長さだけの入力でも出る', () => {
    expect(durationOf(d({ planDur: 30 }))).toBe(30);
    expect(durationOf(d({ planStart: 600, planEnd: 620 }))).toBe(20);
    expect(durationOf(d({ planDur: 30, actualDur: 25 }))).toBe(25);
    expect(durationOf(d({}))).toBeNull();
  });
  it('表示＝60分以上は時間で', () => {
    expect(fmtDur(25)).toBe('25分'); expect(fmtDur(60)).toBe('1時間'); expect(fmtDur(90)).toBe('1時間30分');
  });
});

describe('枡の検査（負のテスト＝わざと壊して弾かれるか）', () => {
  it('既定の型は全部通る', () => {
    for (const k of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) expect(validateSlots(PRESETS[k].slots, PRESETS[k].fallbackKey)).toEqual([]);
  });
  it('内部名の重なりを弾く', () => {
    const s = structuredClone(todo.slots); s[2].key = s[1].key;
    expect(validateSlots(s, 'none').join()).toMatch(/重なって/);
  });
  it('受け皿が枡の中に無いと弾く', () => {
    expect(validateSlots(todo.slots, 'nope').join()).toMatch(/受け皿/);
  });
  it('時刻で決まる枡が無い種目（一日一回＝「その日」だけ）は通り、時刻を入れた記録は受け皿へ', () => {
    const habit = mk('habit');
    expect(validateSlots(habit.slots, habit.fallbackKey)).toEqual([]);
    expect(bucketOf(habit, e({ actualStart: 5 * 60 + 40 }))).toBe('day');
  });
  it('終わりが次の枡に食い込むと弾く', () => {
    const s = structuredClone(meal.slots); s[1].endMin = 17 * 60; // 昼食の終わり 17:00 > 夕食の始まり 16:30
    expect(validateSlots(s, 'snack').join()).toMatch(/食い込んで/);
  });
  it('同じ始まりの枡が2つあると弾く', () => {
    const s = structuredClone(todo.slots); s[2].startMin = s[1].startMin;
    expect(validateSlots(s, 'none').join()).toMatch(/同じ時刻/);
  });
});
