/* ⏱ 関数 koma-milestones の記録ログ保存（v34）を、実ソースのまま偽の DB で動かす。
 *  ライフログの表の約束（おわりと長さを同時に持たない・おわりは はじめ より後）と、「送られたキーだけ書く」を見る。
 *  ⚠ 同じ規則はライフログの milestones 関数にもある（あちらは tools/check-milestone-log-time.js が見る）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Row = Record<string, unknown>;
const DB: Record<string, Row[]> = { milestones: [], milestone_logs: [] };
let SEQ = 100;
function builder(table: string) {
  if (!DB[table]) throw new Error('偽の DB は ' + table + ' を模していません');
  const st: { eqs: Record<string, unknown>; mode: string; row: Row | null } = { eqs: {}, mode: 'select', row: null };
  const rowsNow = () => DB[table].filter((r) => Object.entries(st.eqs).every(([k, v]) => String(r[k]) === String(v)));
  const b = {
    select() { return b; }, order() { return b; },
    eq(c: string, v: unknown) { st.eqs[c] = v; return b; },
    update(row: Row) { st.mode = 'update'; st.row = row; return b; },
    insert(row: Row) { st.mode = 'insert'; st.row = row; return b; },
    then(ok: (v: unknown) => unknown) { return Promise.resolve({ data: rowsNow(), error: null }).then(ok); },
    maybeSingle() { return Promise.resolve({ data: rowsNow()[0] ?? null, error: null }); },
    single() {
      if (st.mode === 'insert') { const r = { id: ++SEQ, photos: [], start_min: null, end_min: null, dur_min: null, ...st.row }; DB[table].push(r); return Promise.resolve({ data: r, error: null }); }
      const hit = rowsNow(); if (!hit.length) return Promise.resolve({ data: null, error: { message: 'no rows' } });
      if (st.mode === 'update') Object.assign(hit[0], st.row);
      return Promise.resolve({ data: hit[0], error: null });
    },
  };
  return b;
}
(globalThis as Record<string, unknown>).__komaStubClient = () => ({ from: (t: string) => builder(t), storage: { from: () => ({ remove: async () => ({ error: null }) }) } });

let handler: ((req: Request) => Promise<Response>) | null = null;
beforeAll(async () => {
  const src = readFileSync(join(__dirname, '..', 'supabase/functions/koma-milestones/index.ts'), 'utf8');
  const IMPORT = "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';";
  if (!src.includes(IMPORT)) throw new Error('supabase-js の import 行が読めません（形が変わった？ このテストも直す）');
  const dir = mkdtempSync(join(tmpdir(), 'komams-'));
  const f = join(dir, 'run.ts');
  writeFileSync(f, src.replace(IMPORT, 'const createClient = (globalThis as any).__komaStubClient;'));
  (globalThis as Record<string, unknown>).Deno = { env: { get: (k: string) => ({ KOMA_SECRET: 's3', SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } as Record<string, string>)[k] }, serve: (h: typeof handler) => { handler = h; } };
  await import(/* @vite-ignore */ pathToFileURL(f).href);
  rmSync(dir, { recursive: true, force: true });
});
const post = async (body: Row) => {
  const r = await handler!(new Request('https://x/functions/v1/koma-milestones?op=log', { method: 'POST', headers: { 'x-koma-secret': 's3', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: r.status, json: await r.json() as Row };
};
const base = { milestone_id: 1, log_date: '2026-09-27', note: '高尾山 3号路 6号路 2時間程度' };

describe('⏱ koma-milestones の記録ログ保存（実ソースのまま）', () => {
  it('長さだけ（時刻は覚えていない）', async () => {
    const a = await post({ ...base, dur_min: 120 });
    expect(a.status).toBe(200); expect(a.json).toMatchObject({ dur_min: 120, start_min: null, end_min: null });
  });
  it('🚨 おわりと一緒の長さは外す・長さだけの更新は古いおわりを外す（表の CHECK に 500 で落ちない）', async () => {
    const a = await post({ ...base, start_min: 600, end_min: 720, dur_min: 180 });
    expect(a.json).toMatchObject({ start_min: 600, end_min: 720, dur_min: null });
    const b = await post({ id: a.json.id, ...base, dur_min: 90 });
    expect(b.json).toMatchObject({ start_min: 600, end_min: null, dur_min: 90 });
  });
  it('🚨 時刻のキーを送らない保存（古いコマ）は、入っている時刻を消さない・null で外せる', async () => {
    const a = await post({ ...base, start_min: 540, dur_min: 60 });
    const b = await post({ id: a.json.id, ...base, note: 'メモだけ直す' });
    expect(b.json).toMatchObject({ start_min: 540, dur_min: 60, note: 'メモだけ直す' });
    const c = await post({ id: a.json.id, ...base, start_min: null, end_min: null, dur_min: null });
    expect(c.json).toMatchObject({ start_min: null, end_min: null, dur_min: null });
  });
  it('🚨 空は 00:00 にしない・0分と範囲の外の長さは null', async () => {
    expect((await post({ ...base, start_min: null, end_min: '' })).json).toMatchObject({ start_min: null, end_min: null });
    expect((await post({ ...base, dur_min: 0 })).json).toMatchObject({ dur_min: null });
    expect((await post({ ...base, dur_min: 43000 })).json).toMatchObject({ dur_min: null });
  });
  it('おわりが前・幅ゼロ・範囲の外の時刻は日本語で断る', async () => {
    expect((await post({ ...base, start_min: 720, end_min: 600 })).status).toBe(400);
    expect((await post({ ...base, start_min: 600, end_min: 600 })).status).toBe(400);
    const c = await post({ ...base, start_min: 1500 });
    expect(c.status).toBe(400); expect(String(c.json.error)).toMatch(/はじめの時刻/);
    expect((await post({ ...base, start_min: 1380, end_min: 1440 })).json).toMatchObject({ end_min: 1440 });
  });
  it('読む列（GET）も新しい3つを名指しする', () => {
    const src = readFileSync(join(__dirname, '..', 'supabase/functions/koma-milestones/index.ts'), 'utf8');
    expect(src).toMatch(/const LOG_COLS = 'id, milestone_id, log_date, note, photos, start_min, end_min, dur_min';/);
    expect((src.match(/select\(LOG_COLS\)/g) ?? []).length).toBe(3);
  });
});
