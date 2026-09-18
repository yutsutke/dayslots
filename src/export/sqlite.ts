/* SQLite の書き出し＝端末の中で SQLite の実体（sql.js＝ブラウザで動く SQLite）を作り、ファイルにする。
 *  読むのは DB Browser for SQLite や Python の sqlite3 でそのまま。列は supabase/migrations/0001_init.sql と同じ名前（snake_case）。
 *  ⚠ 部品（約1MB）は書き出すときだけ CDN から読む＝ふだんの起動を重くしない。読み込みは JSON からだけ（SQLite からの読み込みは作っていない）
 */
import type { Db, Entry } from '../domain/types';

type SqlJs = { Database: new () => { run: (sql: string, params?: unknown[]) => void; export: () => Uint8Array; close: () => void } };
type InitSqlJs = (o: { locateFile: (f: string) => string }) => Promise<SqlJs>;
const CDN = 'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/';

async function loadSqlJs(): Promise<SqlJs> {
  const w = window as unknown as { initSqlJs?: InitSqlJs };
  if (!w.initSqlJs) {
    await new Promise<void>((ok, ng) => { const s = document.createElement('script'); s.src = `${CDN}sql-wasm.js`; s.onload = () => ok(); s.onerror = () => ng(new Error('SQLite の部品が読めませんでした（ネット？）')); document.head.append(s); });
  }
  if (!w.initSqlJs) throw new Error('SQLite の部品が読めませんでした');
  return w.initSqlJs({ locateFile: (f) => CDN + f });
}

const j = (v: unknown) => JSON.stringify(v ?? null);
const cols = <T extends object>(o: T, keys: (keyof T)[]) => keys.map((k) => { const v = o[k]; return v === undefined ? null : typeof v === 'object' && v !== null ? j(v) : (v as unknown); });

export async function exportSqlite(db: Db): Promise<Uint8Array> {
  const SQL = await loadSqlJs(); const d = new SQL.Database();
  d.run(`create table koma_tracks (id text primary key, name text, icon text, kind text, slots text, fallback_key text, features text, sort_order int, archived int, aliases text);
create table koma_templates (id text primary key, track_id text, name text, slot_key text, title text, note text, payload text, photos text, plan_start int, plan_end int, plan_dur int, calendar int, aliases text, sort_order int, created_at text, updated_at text);
create table koma_rules (id text primary key, track_id text, title text, note text, payload text, template_id text, freq text, byday text, interval int, half text, day_from int, day_to int, start_date text, end_date text, slot_key text, plan_start int, plan_end int, plan_dur int, priority int, tag text, auto int, active int, calendar int, exceptions text, sort_order int, created_at text, updated_at text);
create table koma_entries (id text primary key, track_id text, date text, slot_key text, plan_start int, plan_end int, plan_dur int, actual_date text, actual_start int, actual_end int, actual_dur int, done_at text, skipped_at text, instead_of_id text, title text, note text, priority int, tag text, template_id text, rule_id text, rule_date text, photos text, payload text, calendar int, sort_order int, created_at text, updated_at text);
create table koma_meta (key text primary key, value text);`);
  for (const t of db.tracks) d.run('insert into koma_tracks values (?,?,?,?,?,?,?,?,?,?)', [t.id, t.name, t.icon, t.kind, j(t.slots), t.fallbackKey, j(t.features), t.sortOrder, t.archived ? 1 : 0, j(t.aliases ?? [])]);
  for (const t of db.templates) d.run('insert into koma_templates values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [t.id, t.trackId, t.name, t.slotKey, t.title, t.note, j(t.payload), j(t.photos.map((p) => ({ path: p.path }))), t.planStart, t.planEnd, t.planDur ?? null, t.calendar ? 1 : 0, j(t.aliases ?? []), t.sortOrder, t.createdAt, t.updatedAt]);
  for (const r of db.rules) d.run('insert into koma_rules values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [r.id, r.trackId, r.title, r.note, j(r.payload), r.templateId, r.freq, j(r.byday), r.interval, r.half, r.dayFrom, r.dayTo, r.startDate, r.endDate, r.slotKey, r.planStart, r.planEnd, r.planDur ?? null, r.priority, r.tag, r.auto ? 1 : 0, r.active ? 1 : 0, r.calendar ? 1 : 0, j(r.exceptions), r.sortOrder, r.createdAt, r.updatedAt]);
  for (const e of db.entries) {
    const v = cols(e as Entry, ['id', 'trackId', 'date', 'slotKey', 'planStart', 'planEnd', 'planDur', 'actualDate', 'actualStart', 'actualEnd', 'actualDur', 'doneAt', 'skippedAt', 'insteadOfId', 'title', 'note', 'priority', 'tag', 'templateId', 'ruleId', 'ruleDate']);
    // 写真＝サムネ（data URL・大きい）は SQLite には入れず、本体の場所（idb:…）だけ
    d.run('insert into koma_entries values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [...v, j(e.photos.map((p) => ({ path: p.path }))), j(e.payload), e.calendar ? 1 : 0, e.sortOrder, e.createdAt, e.updatedAt]);
  }
  d.run('insert into koma_meta values (?,?)', ['exported_at', new Date().toISOString()]);
  d.run('insert into koma_meta values (?,?)', ['settings', j({ ...db.settings, ai: undefined, storage: undefined })]); // 鍵は入れない
  d.run('insert into koma_meta values (?,?)', ['holidays', j(db.holidays)]);
  const out = d.export(); d.close(); return out;
}
