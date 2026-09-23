/* 🗓 記念日の口＝関数 koma-milestones を通して、ライフログの表を読む／足す／直す。
 *  つなぎ先と合言葉は ☁ 外の写し（Supabase）と同じもの＝⚙ で新しく入れるものは無い。
 *  端末には「最後に読めた一覧」だけを別の箱に控える＝開いてすぐ出す・電波が無くても見える。記録（Db）には入れない（正本はライフログ）。
 */
import type { Milestone, MilestoneLog, Reminder } from '../domain/milestones';

export interface MilestoneConn { supabaseUrl?: string; supabaseSecret?: string; }
export interface MilestoneData { milestones: Milestone[]; logs: MilestoneLog[]; readAt: string; }

const CACHE = 'dayslots.milestones';
export const connected = (c: MilestoneConn | undefined): boolean => Boolean(c?.supabaseUrl && c?.supabaseSecret);
const url = (c: MilestoneConn, op?: string) => `${(c.supabaseUrl ?? '').replace(/\/$/, '')}/functions/v1/koma-milestones${op ? `?op=${op}` : ''}`;
const headers = (c: MilestoneConn) => ({ 'content-type': 'application/json', 'x-koma-secret': c.supabaseSecret ?? '' });

type RawM = { id: number; title: string; event_date: string; event_time: string | null; note: string | null; label: string | null; reminders: unknown; photo_count?: number };
type RawL = { id: number; milestone_id: number; log_date: string; note: string | null; photo_count?: number };
/** 関数の返事を、コマの言葉に直す（時刻は HH:MM まで・リマインダーは形の合うものだけ） */
export function fromRaw(m: RawM): Milestone {
  const rem = Array.isArray(m.reminders) ? (m.reminders as Reminder[]).filter((r) => r && ['m', 'w', 'd'].includes(r.u) && Number.isInteger(r.n) && r.n >= 1) : [];
  return { id: m.id, title: m.title, date: m.event_date, time: m.event_time ? m.event_time.slice(0, 5) : null, note: m.note, label: m.label, reminders: rem, photoCount: m.photo_count ?? 0 };
}
export const logFromRaw = (l: RawL): MilestoneLog => ({ id: l.id, milestoneId: l.milestone_id, date: l.log_date, note: l.note, photoCount: l.photo_count ?? 0 });

async function call<T>(c: MilestoneConn, op: string | undefined, body?: unknown): Promise<T> {
  let r: Response;
  try { r = await fetch(url(c, op), body === undefined ? { headers: headers(c) } : { method: 'POST', headers: headers(c), body: JSON.stringify(body) }); }
  catch { throw new Error('記念日の関数につながりませんでした（電波か、関数 koma-milestones がまだ置かれていない）'); }
  if (r.status === 404) throw new Error('関数 koma-milestones がまだ置かれていません');
  if (r.status === 401) throw new Error('合言葉が違います（⚙ → 保存場所 の Supabase）');
  if (!r.ok) throw new Error(`記念日の関数がエラーを返しました（${r.status}）`);
  return r.json() as Promise<T>;
}

export async function fetchMilestones(c: MilestoneConn): Promise<MilestoneData> {
  const b = await call<{ milestones: RawM[]; logs: RawL[] }>(c, undefined);
  const d: MilestoneData = { milestones: b.milestones.map(fromRaw), logs: b.logs.map(logFromRaw), readAt: new Date().toISOString() };
  try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch { /* 控えられなくても表示はできる */ }
  return d;
}
export function cachedMilestones(): MilestoneData | null {
  try { const s = localStorage.getItem(CACHE); return s ? (JSON.parse(s) as MilestoneData) : null; } catch { return null; }
}
export async function saveMilestone(c: MilestoneConn, m: Omit<Milestone, 'id' | 'photoCount'> & { id?: number }): Promise<Milestone> {
  const raw = await call<RawM>(c, 'save', { id: m.id, title: m.title, event_date: m.date, event_time: m.time, note: m.note, label: m.label, reminders: m.reminders });
  return fromRaw(raw);
}
export async function saveLog(c: MilestoneConn, l: { id?: number; milestoneId: number; date: string; note: string | null }): Promise<MilestoneLog> {
  return logFromRaw(await call<RawL>(c, 'log', { id: l.id, milestone_id: l.milestoneId, log_date: l.date, note: l.note }));
}
/** 消す＝記念日（記録ログも一緒に消える）／記録ログ1件。写真の実体も関数の側で消える */
export async function deleteMilestone(c: MilestoneConn, id: number): Promise<void> {
  await callDelete(c, `milestone&id=${id}`);
}
export async function deleteLog(c: MilestoneConn, id: number): Promise<void> {
  await callDelete(c, `log&id=${id}`);
}
async function callDelete(c: MilestoneConn, q: string): Promise<void> {
  let r: Response;
  try { r = await fetch(url(c, q), { method: 'DELETE', headers: headers(c) }); }
  catch { throw new Error('記念日の関数につながりませんでした'); }
  if (r.status === 404) throw new Error('もう消えているか、関数が古いままです（koma-milestones を置き直す）');
  if (r.status === 405) throw new Error('関数が古いままです（koma-milestones を置き直す）');
  if (!r.ok) throw new Error(`消せませんでした（${r.status}）`);
}
