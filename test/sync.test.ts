import { describe, it, expect } from 'vitest';
import { forExport, mergeRemote } from '../src/sync/target';
import { buildDelta, applyDelta, type DocLike } from '../src/sync/delta';
import { readFileSync } from 'node:fs';
import { seedDb } from '../src/store/seed';
import type { Db, Entry } from '../src/domain/types';

const TODAY = '2026-09-17';
const withOld = (): Db => {
  const db = seedDb(TODAY);
  const base = db.entries[0];
  const old: Entry = { ...base, id: 'old1', date: '2026-06-01', actualDate: null, title: '古い記録', ruleId: null, ruleDate: null };
  db.entries.push(old);
  return db;
};

describe('☁ 外の写し', () => {
  it('鍵（🤖 BYOK）と保存場所の設定は外に送らない。記録・種目・⭐・🔁 はそのまま', () => {
    const db = seedDb(TODAY);
    db.settings.ai = { provider: 'anthropic', key: 'sk-ant-secret', model: 'm' };
    db.settings.storage = { kind: 'supabase', supabaseUrl: 'https://x.supabase.co', supabaseSecret: 'pw' };
    const out = forExport(db, TODAY);
    expect(JSON.stringify(out)).not.toMatch(/sk-ant-secret|pw|supabaseSecret/);
    expect(out.settings.ai).toBeUndefined(); expect(out.settings.storage).toBeUndefined();
    expect(out.tracks.length).toBe(db.tracks.length); expect(out.entries.length).toBe(db.entries.length);
    expect(out.window).toBeNull();
    expect(db.settings.ai?.key).toBe('sk-ant-secret'); // 元は触らない
  });

  it('送る期間＝直近1か月なら、記録はその日から先だけ。種目・⭐・🔁 は全部。写しに window.from が付く', () => {
    const db = withOld();
    db.settings.storage = { kind: 'supabase', windowDays: 31 };
    const out = forExport(db, TODAY);
    expect(out.window).toEqual({ from: '2026-08-17' });
    expect(out.entries.some((e) => e.id === 'old1')).toBe(false);
    expect(out.entries.length).toBe(db.entries.length - 1);
    expect(out.tracks.length).toBe(db.tracks.length); expect(out.rules.length).toBe(db.rules.length); expect(out.templates.length).toBe(db.templates.length);
    expect(db.entries.some((e) => e.id === 'old1')).toBe(true); // 端末の記録は減らない
  });

  it('期間つきの写しを取り込んでも、期間より前の記録は端末に残る（負のテスト＝丸ごと置き換えると消える）', () => {
    const local = withOld();
    local.settings.storage = { kind: 'supabase', windowDays: 31 };
    local.settings.ai = { provider: 'gemini', key: 'k', model: 'm' };
    const remote = forExport(local, TODAY);
    const m = mergeRemote(remote, local);
    expect(m.entries.some((e) => e.id === 'old1')).toBe(true);
    expect(m.entries.length).toBe(local.entries.length);
    expect(m.settings.ai?.key).toBe('k'); expect(m.settings.storage?.windowDays).toBe(31);
    expect(m.window).toBeNull(); // 端末の側には印を残さない
    expect({ ...remote }.entries.some((e) => e.id === 'old1')).toBe(false); // 丸ごと置き換えていたら消えていた
  });

  it('期間の中の削除と追加は伝わる（別の端末で消した・足した）', () => {
    const local = withOld();
    local.settings.storage = { kind: 'supabase', windowDays: 31 };
    const remote = forExport(local, TODAY);
    remote.entries = remote.entries.filter((e) => e.id !== 'e5');                       // 向こうで消した
    remote.entries.push({ ...local.entries[0], id: 'new1', date: TODAY, title: '向こうで足した' });
    const m = mergeRemote(remote, local);
    expect(m.entries.some((e) => e.id === 'e5')).toBe(false);
    expect(m.entries.some((e) => e.id === 'new1')).toBe(true);
    expect(m.entries.some((e) => e.id === 'old1')).toBe(true);
  });

  it('期間なし（すべて）の写しは今までどおり丸ごと置き換える', () => {
    const local = withOld();
    const remote = forExport(seedDb(TODAY), TODAY);
    expect(mergeRemote(remote, local).entries.some((e) => e.id === 'old1')).toBe(false);
  });

  it('差分＝前回送ってから変わった記録と、消した id だけ。芯（種目・いつもの・繰り返し・設定）は丸ごと', () => {
    const db = seedDb(TODAY);
    const since = '2026-09-17T12:00:00.000Z';
    for (const e of db.entries) e.updatedAt = '2026-09-17T00:00:00.000Z';
    db.entries[0].updatedAt = '2026-09-17T13:00:00.000Z'; db.entries[0].title = '直した';
    db.savedAt = '2026-09-17T13:00:01.000Z';
    const out = forExport(db, TODAY) as unknown as DocLike;
    const d = buildDelta(out, since, 'BASE', ['gone1']);
    expect(d.upserts.map((e) => e.id)).toEqual([db.entries[0].id]);
    expect(d.deletes).toEqual(['gone1']); expect(d.baseSavedAt).toBe('BASE');
    expect(Object.keys(d.core).sort()).toEqual(['calendarMap', 'holidays', 'rules', 'settings', 'templates', 'tracks']);
    expect(JSON.stringify(d).length).toBeLessThan(JSON.stringify(out).length);
  });

  it('差分を当てると、丸ごと送ったのと同じ写しになる（直し・追加・削除・期間の切り落とし）', () => {
    const before = withOld(); before.settings.storage = { kind: 'supabase', windowDays: 31 };
    for (const e of before.entries) e.updatedAt = '2026-09-17T00:00:00.000Z';
    const base = forExport(before, TODAY) as unknown as DocLike; base.savedAt = 'T0';
    const after = structuredClone(before);
    after.entries = after.entries.filter((e) => e.id !== 'e5');                                   // 消した
    after.entries.find((e) => e.id === 'e2')!.title = '直した'; after.entries.find((e) => e.id === 'e2')!.updatedAt = '2026-09-17T13:00:00.000Z';
    after.entries.push({ ...after.entries[0], id: 'new1', title: '足した', updatedAt: '2026-09-17T13:30:00.000Z' });
    after.tracks[0].name = '名前を変えた'; after.savedAt = 'T1';
    const full = forExport(after, TODAY) as unknown as DocLike;
    const viaDelta = applyDelta(base, buildDelta(full, '2026-09-17T12:00:00.000Z', 'T0', ['e5']));
    // 鍵の並び順は問わない（中身が同じか）＝記録は id 順に並べてから比べる
    const norm = (x: DocLike) => ({ ...x, entries: [...x.entries].sort((a, b) => (a.id < b.id ? -1 : 1)) });
    expect(norm(viaDelta)).toEqual(norm(full));
    expect(viaDelta.entries.some((e) => e.id === 'old1')).toBe(false);
  });

  it('関数の側の delta.ts は src の写し＝1文字も違わない（規則を2か所に書かない）', () => {
    const lf = (x: string) => x.split(String.fromCharCode(13)).join('');
    const a = lf(readFileSync('src/sync/delta.ts', 'utf8'));
    const b = lf(readFileSync('supabase/functions/koma-store/delta.ts', 'utf8'));
    expect(b).toBe(a);
  });
});
