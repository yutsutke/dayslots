import { describe, it, expect } from 'vitest';
import { Syncer, forExport, type SyncTarget } from '../src/sync/target';
import { seedDb } from '../src/store/seed';
import type { Db } from '../src/domain/types';

const TODAY = '2026-09-17';
/** 外の置き場の代わり（メモリの中）。何回丸ごと／差分で書かれたかを数える */
class FakeTarget implements SyncTarget {
  readonly name = 'fake'; pushes = 0;
  constructor(public remote: Db | null) {}
  configured() { return true; }
  async pull(since?: string) {
    if (!this.remote) return null;
    const savedAt = this.remote.savedAt ?? '';
    if (since && new Date(savedAt).getTime() <= new Date(since).getTime()) return { same: true as const, savedAt };
    return { doc: structuredClone(this.remote), savedAt };
  }
  async push(doc: Db) { this.pushes++; this.remote = structuredClone(doc); }
}
const mk = (local: Db, target: FakeTarget, choice: 'pull' | 'push' | 'cancel' = 'cancel') => {
  const box = { db: local, msgs: [] as string[] };
  const s = new Syncer(() => box.db, (d) => { box.db = d; }, (m) => box.msgs.push(m), () => {}, async () => choice);
  s.target = () => target;
  return { s, box };
};

describe('☁ 初めてつなぐ端末（負のテスト＝見本で外の写しを上書きしない）', () => {
  const real = (): Db => { const d = seedDb(TODAY); d.entries = d.entries.slice(0, 3); d.entries[0].title = '本物の記録'; d.savedAt = '2026-09-17T01:00:00.000Z'; return forExport(d, TODAY); };
  const fresh = (): Db => { const d = seedDb(TODAY); d.savedAt = '2026-09-18T09:00:00.000Z'; d.settings.storage = { kind: 'supabase', supabaseUrl: 'u', supabaseSecret: 'p' }; return d; }; // 見本・時刻は外より新しい

  it('自動（開いたとき・保存の3秒後）では何も送らず、選んでと伝えるだけ', async () => {
    const t = new FakeTarget(real()); const { s, box } = mk(fresh(), t);
    expect(await s.pullIfNewer()).toBe('choice');
    await s.pushNow();
    expect(t.pushes).toBe(0); expect(t.remote?.entries[0].title).toBe('本物の記録');
    expect(box.msgs.join()).toMatch(/初めてつなぎます/);
  });
  it('「今 合わせる」で 取り込む を選ぶ → 外の写しで丸ごと置き換え。保存場所の設定は端末のものが残る', async () => {
    const t = new FakeTarget(real()); const { s, box } = mk(fresh(), t, 'pull');
    expect(await s.pullIfNewer(true)).toBe('pulled');
    expect(box.db.entries.length).toBe(3); expect(box.db.entries[0].title).toBe('本物の記録');
    expect(box.db.settings.storage?.supabaseSecret).toBe('p'); expect(box.db.settings.storage?.remoteSavedAt).toBe('2026-09-17T01:00:00.000Z');
    expect(t.pushes).toBe(0);
  });
  it('送る を選んだときだけ外を置き換える。やめる なら何もしない', async () => {
    const t1 = new FakeTarget(real()); const a = mk(fresh(), t1, 'cancel');
    expect(await a.s.pullIfNewer(true)).toBe('none'); expect(t1.pushes).toBe(0);
    const t2 = new FakeTarget(real()); const b = mk(fresh(), t2, 'push');
    expect(await b.s.pullIfNewer(true)).toBe('pushed'); expect(t2.pushes).toBe(1);
    expect(b.box.db.settings.storage?.remoteSavedAt).toBeTruthy();
  });
  it('外に何も無ければ、聞かずに送る', async () => {
    const t = new FakeTarget(null); const { s } = mk(fresh(), t);
    expect(await s.pullIfNewer()).toBe('pushed'); expect(t.pushes).toBe(1);
  });
  it('一度合わせた端末は今までどおり＝外が新しければ取り込み、同じなら落とさない', async () => {
    const t = new FakeTarget(real()); const { s, box } = mk(fresh(), t, 'pull');
    await s.pullIfNewer(true);
    box.db.savedAt = t.remote!.savedAt;
    expect(await s.pullIfNewer()).toBe('same');
    t.remote!.savedAt = '2026-09-19T00:00:00.000Z'; t.remote!.entries[0].title = '別の端末で直した';
    expect(await s.pullIfNewer()).toBe('pulled'); expect(box.db.entries.find((e) => e.id === t.remote!.entries[0].id)?.title).toBe('別の端末で直した');
  });
});
