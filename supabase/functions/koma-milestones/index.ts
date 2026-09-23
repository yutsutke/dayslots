// koma-milestones ＝ コマから ライフログの 🗓 記念日（表 milestones・milestone_logs）を読む／足す／直す／消す Edge Function。
//   GET                    → { milestones, logs }（写真は数だけ＝photo_count。写真そのものは渡さない）
//   POST ?op=save  {id?, title, event_date, event_time?, note?, label?, reminders?} → 保存した行（id があれば直す・無ければ足す）
//   POST ?op=log   {id?, milestone_id, log_date, note?}                              → 保存した記録ログの行
//   DELETE ?op=milestone&id=N → 記念日を消す（記録ログも一緒に消える＝表の決まり on delete cascade）＋写真の実体も消す
//   DELETE ?op=log&id=N       → 記録ログを1件消す＋写真の実体も消す
//   守り＝ヘッダ x-koma-secret が Secret KOMA_SECRET と一致するときだけ（koma-store と同じ合言葉）
// ⚠ 正本はライフログの表＝コマ側に写しを持たない（2つの正本を作らない）。
// ⚠ 消す（v32・ゆう「コマからも削除できるように」）＝ライフログの milestones 関数と同じ順と守り：
//    先に行を消し、消せたときだけ写真の実体を消す／消してよい写真は `<uuid>.jpg`（バケット直下）の形だけ（🧾・🍽 の写真を道連れにしない）。
//    記念日を消すときは、ぶら下がる記録ログの写真も集めて消す（ライフログの関数は記録ログの写真を残してしまう＝孤児になる）。
// ⚠ 写真の列（photos）には触らない＝送られてきても読まない。直すときも列ごと送らない＝ライフログで付けた写真が消えない。
// ⚠ koma-store に op を足さなかった理由＝あの関数は op を知らず、GET は文書を返し PUT は文書を丸ごと置き換える。
//    画面が新しく関数が古いと「記念日を保存」が「文書を置き換え」に化ける（ライフログ 2026-08-19 に meals で実際に壊れた形）。
//    別の関数なら、古いままでも「関数が無い」で止まる。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-koma-secret, authorization, apikey', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...CORS } });
const COLS = 'id, title, event_date, event_time, note, label, reminders, photos';
const LOG_COLS = 'id, milestone_id, log_date, note, photos';
const YMD = /^\d{4}-\d{2}-\d{2}$/, HM = /^\d{2}:\d{2}(:\d{2})?$/;
const KNOWN_OPS = ['save', 'log', 'milestone'];
const BUCKET = 'journal-photos'; // ライフログの写真の置き場（非公開・直下に <uuid>.jpg）
const PHOTO_RE = /^[0-9a-fA-F-]{36}\.jpg$/; // ライフログ milestones 関数の cleanPhotos と同じ形
const photoPaths = (v: unknown): string[] => (Array.isArray(v) ? v : []).filter((p): p is string => typeof p === 'string' && PHOTO_RE.test(p));

type Row = { photos?: unknown } & Record<string, unknown>;
/** 写真は数だけにして返す（パスを外に出さない） */
const slim = (r: Row) => { const { photos, ...rest } = r; return { ...rest, photo_count: Array.isArray(photos) ? photos.length : 0 }; };
const cleanReminders = (x: unknown) => Array.isArray(x)
  ? x.filter((r) => r && ['m', 'w', 'd'].includes(r.u) && Number.isInteger(r.n) && r.n >= 1 && r.n <= 366).map((r) => ({ u: r.u, n: r.n })).slice(0, 16)
  : null;
const text = (x: unknown, max: number) => (typeof x === 'string' && x.trim() ? x.slice(0, max) : null);

Deno.serve(async (req) => {
  // ⚠ 事前確認（OPTIONS）は本文なしで返す（本文つきの 204 は Deno が 500 にする＝koma-store で踏んだ）
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const secret = Deno.env.get('KOMA_SECRET') ?? '';
  if (!secret || req.headers.get('x-koma-secret') !== secret) return json({ error: 'unauthorized' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const op = new URL(req.url).searchParams.get('op');
  // 知らない op・合わないメソッドは必ず弾く（黙って別の意味で動かない）
  if (op && !KNOWN_OPS.includes(op)) return json({ error: `この操作を知りません: ${op}` }, 400);

  if (req.method === 'GET' && !op) {
    const [a, b] = await Promise.all([
      sb.from('milestones').select(COLS).order('event_date'),
      sb.from('milestone_logs').select(LOG_COLS).order('log_date'),
    ]);
    if (a.error || b.error) return json({ error: 'db error', detail: (a.error ?? b.error)!.message }, 500);
    return json({ milestones: (a.data ?? []).map(slim), logs: (b.data ?? []).map(slim) });
  }

  if (req.method === 'POST' && op === 'save') {
    const b = await req.json().catch(() => null) as Record<string, unknown> | null;
    const title = text(b?.title, 200), date = b?.event_date;
    if (!b || !title || typeof date !== 'string' || !YMD.test(date)) return json({ error: 'bad request' }, 400);
    const time = b.event_time;
    if (time != null && time !== '' && (typeof time !== 'string' || !HM.test(time))) return json({ error: 'bad request' }, 400);
    const row: Record<string, unknown> = { title, event_date: date, event_time: time || null, note: text(b.note, 4000), label: text(typeof b.label === 'string' ? b.label.trim() : null, 60) };
    const rem = cleanReminders(b.reminders); if (rem) row.reminders = rem;
    const q = b.id != null
      ? sb.from('milestones').update({ ...row, updated_at: new Date().toISOString() }).eq('id', Number(b.id)).select(COLS).single()
      : sb.from('milestones').insert(row).select(COLS).single();
    const { data, error } = await q;
    if (error) return json({ error: 'db error', detail: error.message }, 500);
    return json(slim(data as Row));
  }

  if (req.method === 'POST' && op === 'log') {
    const b = await req.json().catch(() => null) as Record<string, unknown> | null;
    const mid = Number(b?.milestone_id), date = b?.log_date;
    if (!b || !Number.isInteger(mid) || typeof date !== 'string' || !YMD.test(date)) return json({ error: 'bad request' }, 400);
    const row = { milestone_id: mid, log_date: date, note: text(b.note, 4000) };
    const q = b.id != null
      ? sb.from('milestone_logs').update({ ...row, updated_at: new Date().toISOString() }).eq('id', Number(b.id)).eq('milestone_id', mid).select(LOG_COLS).single()
      : sb.from('milestone_logs').insert(row).select(LOG_COLS).single();
    const { data, error } = await q;
    if (error) return json({ error: 'db error', detail: error.message }, 500);
    return json(slim(data as Row));
  }

  if (req.method === 'DELETE' && (op === 'milestone' || op === 'log')) {
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return json({ error: 'bad request' }, 400);
    let paths: string[] = [];
    if (op === 'log') {
      const { data: row } = await sb.from('milestone_logs').select('photos').eq('id', id).maybeSingle();
      if (!row) return json({ error: 'not found' }, 404);
      paths = photoPaths(row.photos);
      const { error } = await sb.from('milestone_logs').delete().eq('id', id);
      if (error) return json({ error: 'db error', detail: error.message }, 500);
    } else {
      const { data: row } = await sb.from('milestones').select('photos').eq('id', id).maybeSingle();
      if (!row) return json({ error: 'not found' }, 404);
      const { data: logs } = await sb.from('milestone_logs').select('photos').eq('milestone_id', id);
      paths = [...photoPaths(row.photos), ...(logs ?? []).flatMap((l) => photoPaths(l.photos))];
      const { error } = await sb.from('milestones').delete().eq('id', id); // 記録ログは表の決まりで一緒に消える
      if (error) return json({ error: 'db error', detail: error.message }, 500);
    }
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    return json({ ok: true, photos_removed: paths.length });
  }

  return json({ error: `method not allowed: ${req.method}${op ? ` ?op=${op}` : ''}` }, 405);
});
