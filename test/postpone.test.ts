import { describe, it, expect } from 'vitest';
import { Repo } from '../src/app/repo';
import { MemoryStore } from '../src/store/store';
import { seedDb } from '../src/store/seed';
import { postponeCount, originalDate, postponeChain, postponeDays, fmtPostpone } from '../src/domain/postpone';

const TODAY = '2026-09-17';
const open = () => Repo.open(new MemoryStore(), () => seedDb(TODAY), () => TODAY);
/** 素の記録を1つ（種目＝やること） */
const one = async () => { const r = await open(); const t = r.tracks[0]; return { r, e: r.addEntry(t.id, { date: '2026-09-18', title: '伝票づくり' }) }; };

describe('⏭ 先送り＝やる日を動かし、もともとの日は残す', () => {
  it('先送りすると やる日が動き、もともとの日が履歴に残る', async () => {
    const { r, e } = await one();
    const p = r.postpone(e.id, '2026-09-20');
    expect(p.date).toBe('2026-09-20');
    expect(originalDate(p)).toBe('2026-09-18');
    expect(postponeCount(p)).toBe(1);
  });

  it('何度先送りしても、もともとの日は最初のまま・回数だけ増える', async () => {
    const { r, e } = await one();
    r.postpone(e.id, '2026-09-20');
    r.postpone(e.id, '2026-09-22');
    const p = r.postpone(e.id, '2026-09-30');
    expect(p.date).toBe('2026-09-30');
    expect(originalDate(p)).toBe('2026-09-18');
    expect(postponeCount(p)).toBe(3);
    expect(postponeChain(p)).toEqual(['2026-09-18', '2026-09-20', '2026-09-22', '2026-09-30']);
    expect(postponeDays(p)).toBe(12);
    expect(fmtPostpone(p)).toBe('09-18 から 3回先送り（12日）');
  });

  it('動かした先は保存していない＝次の1回の from（最後は いまの日）から読む', async () => {
    const { r, e } = await one();
    r.postpone(e.id, '2026-09-20');
    const p = r.postpone(e.id, '2026-09-22');
    expect(p.postponed).toEqual([
      { from: '2026-09-18', at: expect.any(String) },
      { from: '2026-09-20', at: expect.any(String) },
    ]);
  });

  it('先送りのあとで 🚫 やらない を選べる（履歴は残る）', async () => {
    const { r, e } = await one();
    r.postpone(e.id, '2026-09-20');
    const s = r.setSkipped(e.id, true);
    expect(s.skippedAt).not.toBeNull();
    expect(postponeCount(s)).toBe(1);
    expect(originalDate(s)).toBe('2026-09-18');
  });

  it('先送りのあとで 🔀 代わりに を選べる（代わりは動かした先の日に入る・履歴は元に残る）', async () => {
    const { r, e } = await one();
    r.postpone(e.id, '2026-09-20');
    const alt = r.doInstead(e.id, '電話ですませた');
    expect(alt.date).toBe('2026-09-20');
    expect(alt.insteadOfId).toBe(e.id);
    const src = r.entry(e.id)!;
    expect(src.skippedAt).not.toBeNull();     // 元は 🚫 で閉じる（今までの決まりのまま）
    expect(postponeCount(src)).toBe(1);        // 先送りの履歴は残る
  });

  it('先送りのあとで ✅ やった を選べる（実際の日は動かした先）', async () => {
    const { r, e } = await one();
    r.postpone(e.id, '2026-09-20');
    const d = r.setDone(e.id, true);
    expect(d.actualDate).toBe('2026-09-20');
    expect(originalDate(d)).toBe('2026-09-18');
  });

  it('🔁 から生まれた記録を先送りしても、元の日に二重に作られない', async () => {
    const r = await open();
    r.ensureAuto('2026-09-11', TODAY);
    const made = r.db.entries.find((x) => x.ruleId && !x.doneAt && !x.skippedAt) ?? r.db.entries.find((x) => x.ruleId);
    expect(made).toBeTruthy();
    if (made!.doneAt || made!.skippedAt) { r.setDone(made!.id, false); r.setSkipped(made!.id, false); } // 先送りは「まだやっていない」記録だけ
    const before = r.db.entries.length;
    r.postpone(made!.id, '2026-09-30');
    r.ensureAuto('2026-09-11', TODAY);         // もう一度なぞっても増えない
    expect(r.db.entries.length).toBe(before);
    expect(r.entry(made!.id)!.ruleDate).toBe(made!.ruleDate); // 回の印は触らない
  });

  // ── 負のテスト ──
  it('済んだ記録（✅）は先送りできない＝印を黙って消さない', async () => {
    const { r, e } = await one();
    r.setDone(e.id, true);
    expect(() => r.postpone(e.id, '2026-09-20')).toThrow(/✅/);
    expect(r.entry(e.id)!.date).toBe('2026-09-18');
  });

  it('🚫 やらないと決めた記録は先送りできない', async () => {
    const { r, e } = await one();
    r.setSkipped(e.id, true);
    expect(() => r.postpone(e.id, '2026-09-20')).toThrow(/🚫/);
    expect(r.entry(e.id)!.date).toBe('2026-09-18');
  });

  it('一日一回の種目（座禅）は先送りできない＝その日の1件だから', async () => {
    const r = await open();
    const daily = r.tracks.find((t) => t.features.daily)!;
    const e = r.addEntry(daily.id, { date: '2026-09-18', title: daily.name });
    expect(() => r.postpone(e.id, '2026-09-20')).toThrow(/一日一回/);
  });

  it('前の日・同じ日へは先送りできない（前倒しを履歴に混ぜない）', async () => {
    const { r, e } = await one();
    expect(() => r.postpone(e.id, '2026-09-17')).toThrow(/後ろの日/);
    expect(() => r.postpone(e.id, '2026-09-18')).toThrow(/後ろの日/);
    expect(postponeCount(r.entry(e.id)!)).toBe(0);
  });

  it('日付を直しただけでは履歴に積まない（打ち間違いの訂正と先送りは別のもの）', async () => {
    const { r, e } = await one();
    const u = r.updateEntry(e.id, { date: '2026-09-25' });
    expect(u.date).toBe('2026-09-25');
    expect(postponeCount(u)).toBe(0);
    expect(originalDate(u)).toBe('2026-09-25'); // 履歴が無ければ「もともと」は いまの日
  });

  it('一度も動かしていない記録は 0回・言い方は空', async () => {
    const { e } = await one();
    expect(postponeCount(e)).toBe(0);
    expect(postponeDays(e)).toBe(0);
    expect(postponeChain(e)).toEqual(['2026-09-18']);
    expect(fmtPostpone(e)).toBe('');
  });
});
