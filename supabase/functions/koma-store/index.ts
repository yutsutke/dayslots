// koma-store ＝ コマの文書（JSON 丸ごと1つ）を表 koma_docs に置く／読む Edge Function。
//   GET  /functions/v1/koma-store[?since=ISO] → { doc, saved_at }（無ければ 404）。since 以降に変わっていなければ { same:true, saved_at }＝丸ごと落とさない
//   PUT  /functions/v1/koma-store {doc}       → 丸ごと置き換え { ok, saved_at }
//   PUT  /functions/v1/koma-store {delta}     → 差分を当てる { ok, saved_at, entries }。土台（baseSavedAt）が食い違えば 409＝端末が丸ごと送り直す
//   どちらの PUT も review（📝 振り返りの要約）を一緒に受け取り、列 review に置く（AI は select review->>'text' だけ読めば足りる）
//   守り＝ヘッダ x-koma-secret が Secret KOMA_SECRET と一致するときだけ（ライフログの合言葉方式と同じ）
// ⚠ 表は supabase/migrations/0002_koma_docs.sql を先に当てる。Secret KOMA_SECRET を Edge Functions の Secrets に入れる。
// ⚠ delta.ts は src/sync/delta.ts の写し（同じ規則を2か所に書かない＝test が一致を検査する）。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyDelta, type Delta, type DocLike } from './delta.ts';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-koma-secret, authorization, apikey', 'access-control-allow-methods': 'GET, PUT, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...CORS } });

Deno.serve(async (req) => {
  // ⚠ 事前確認（OPTIONS）は**本文なし**で返す＝204 に本文を付けると Deno が例外を投げて 500 になり、ブラウザは「Failed to fetch」になる（2026-09-18 に実際に踏んだ）
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const secret = Deno.env.get('KOMA_SECRET') ?? '';
  if (!secret || req.headers.get('x-koma-secret') !== secret) return json({ error: 'unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? 'default';   // 文書の名前（複数持ちたくなったときのため）

  if (req.method === 'GET') {
    const since = url.searchParams.get('since');
    if (since) { // 変わっていなければ中身を落とさない（Supabase の転送量＝落とす方が数えられる）
      const { data, error } = await sb.from('koma_docs').select('saved_at').eq('id', id).maybeSingle();
      if (error) return json({ error: 'db error', detail: error.message }, 500);
      if (!data) return json({ error: 'not found' }, 404);
      if (new Date(data.saved_at).getTime() <= new Date(since).getTime()) return json({ same: true, saved_at: data.saved_at });
    }
    const { data, error } = await sb.from('koma_docs').select('doc, saved_at').eq('id', id).maybeSingle();
    if (error) return json({ error: 'db error', detail: error.message }, 500);
    if (!data) return json({ error: 'not found' }, 404);
    return json(data);
  }

  if (req.method === 'PUT') {
    const b = await req.json().catch(() => null) as { doc?: DocLike; delta?: Delta; review?: unknown } | null;
    const rv = b?.review && typeof b.review === 'object' ? { review: b.review } : {};   // 要約が無ければ前のを残す
    if (b?.delta) {
      const d = b.delta;
      if (!d.savedAt || !Array.isArray(d.upserts) || !Array.isArray(d.deletes)) return json({ error: 'bad request' }, 400);
      const { data, error } = await sb.from('koma_docs').select('doc').eq('id', id).maybeSingle();
      if (error) return json({ error: 'db error', detail: error.message }, 500);
      const base = data?.doc as DocLike | undefined;
      // 土台が違う（別の端末が先に書いた・写しが無い）＝当てない。端末は丸ごと送り直す
      if (!base || (base.savedAt ?? '') !== d.baseSavedAt) return json({ error: 'conflict', remote_saved_at: base?.savedAt ?? null }, 409);
      const next = applyDelta(base, d);
      const { error: e2 } = await sb.from('koma_docs').upsert({ id, doc: next, saved_at: d.savedAt, updated_at: new Date().toISOString(), ...rv });
      if (e2) return json({ error: 'db error', detail: e2.message }, 500);
      return json({ ok: true, saved_at: d.savedAt, entries: next.entries.length });
    }
    if (!b?.doc || b.doc.version !== 1) return json({ error: 'bad request' }, 400);
    const saved_at = b.doc.savedAt ?? new Date().toISOString();
    const { error } = await sb.from('koma_docs').upsert({ id, doc: b.doc, saved_at, updated_at: new Date().toISOString(), ...rv });
    if (error) return json({ error: 'db error', detail: error.message }, 500);
    return json({ ok: true, saved_at });
  }
  return json({ error: `method not allowed: ${req.method}` }, 405);
});
