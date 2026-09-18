// koma-store ＝ コマの文書（JSON 丸ごと1つ）を表 koma_docs に置く／読む Edge Function。
//   GET  /functions/v1/koma-store            → { doc, saved_at }（無ければ 404）
//   PUT  /functions/v1/koma-store {doc}      → { ok, saved_at }
//   守り＝ヘッダ x-koma-secret が Secret KOMA_SECRET と一致するときだけ（ライフログの合言葉方式と同じ）
// ⚠ 表は supabase/migrations/0002_koma_docs.sql を先に当てる。Secret KOMA_SECRET を Edge Functions の Secrets に入れる。
// ⚠ 丸ごと1行＝1人1台ずつの前提。行単位（複数端末で同時に書く）は Phase 3。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-koma-secret, authorization, apikey', 'access-control-allow-methods': 'GET, PUT, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...CORS } });

Deno.serve(async (req) => {
  // ⚠ 事前確認（OPTIONS）は**本文なし**で返す＝204 に本文を付けると Deno が例外を投げて 500 になり、ブラウザは「Failed to fetch」になる（2026-09-18 に実際に踏んだ）
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const secret = Deno.env.get('KOMA_SECRET') ?? '';
  if (!secret || req.headers.get('x-koma-secret') !== secret) return json({ error: 'unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const id = new URL(req.url).searchParams.get('id') ?? 'default';   // 文書の名前（複数持ちたくなったときのため）
  if (req.method === 'GET') {
    const { data, error } = await sb.from('koma_docs').select('doc, saved_at').eq('id', id).maybeSingle();
    if (error) return json({ error: 'db error', detail: error.message }, 500);
    if (!data) return json({ error: 'not found' }, 404);
    return json(data);
  }
  if (req.method === 'PUT') {
    const b = await req.json().catch(() => null) as { doc?: { version?: number; savedAt?: string } } | null;
    if (!b?.doc || b.doc.version !== 1) return json({ error: 'bad request' }, 400);
    const saved_at = b.doc.savedAt ?? new Date().toISOString();
    const { error } = await sb.from('koma_docs').upsert({ id, doc: b.doc, saved_at, updated_at: new Date().toISOString() });
    if (error) return json({ error: 'db error', detail: error.message }, 500);
    return json({ ok: true, saved_at });
  }
  return json({ error: `method not allowed: ${req.method}` }, 405);
});
