/* 保存場所（同期先）＝端末の保存箱（localStorage）はいつも使い、その**写し**を外に置く。
 *  ・端末のみ＝写しを置かない
 *  ・Google ドライブ＝本人のフォルダに koma.json（＋SQLite の書き出し）
 *  ・Supabase＝Edge Function `koma-store` が表 koma_docs に丸ごと1行で持つ（合言葉で守る）
 *  ぶつかったとき＝**新しい方（savedAt）が勝つ**。開いたときに外の方が新しければ取り込み、保存のたびに少し待ってから押し出す。
 *  ⚠ 行単位の同期（複数端末で同時に書く）は Phase 3 の宿題。いまは「1人が1台ずつ使う」を前提にした丸ごと同期。
 */
import type { Db, ISO } from '../domain/types';
import { driveToken, folderIdOf, findFile, putFile, getFileText } from './drive';

export type StorageKind = 'local' | 'drive' | 'supabase';
export interface StorageSettings {
  kind: StorageKind;
  driveClientId?: string;   // Google Cloud で作る OAuth の Client ID（ウェブ）
  driveFolder?: string;     // フォルダの URL か ID
  supabaseUrl?: string;     // https://xxxx.supabase.co
  supabaseSecret?: string;  // koma-store の合言葉
  lastSync?: ISO;           // 最後に外と合わせた時刻
  lastError?: string;
}

export interface SyncTarget {
  readonly name: string;
  configured(): boolean;
  pull(): Promise<{ doc: Db; savedAt: ISO } | null>;   // 外の写し（無ければ null）
  push(doc: Db): Promise<void>;
}

export class DriveTarget implements SyncTarget {
  readonly name = 'Google ドライブ';
  constructor(private s: StorageSettings) {}
  configured(): boolean { return Boolean(this.s.driveClientId && this.s.driveFolder); }
  async pull(): Promise<{ doc: Db; savedAt: ISO } | null> {
    const tok = await driveToken(this.s.driveClientId ?? '');
    const hit = await findFile(tok, folderIdOf(this.s.driveFolder ?? ''), 'koma.json'); if (!hit) return null;
    const doc = JSON.parse(await getFileText(tok, hit.id)) as Db;
    return { doc, savedAt: doc.savedAt ?? hit.modifiedTime };
  }
  async push(doc: Db): Promise<void> {
    const tok = await driveToken(this.s.driveClientId ?? '');
    await putFile(tok, folderIdOf(this.s.driveFolder ?? ''), 'koma.json', new Blob([JSON.stringify(doc)], { type: 'application/json' }), 'application/json');
  }
  /** SQLite など別の書き出しも同じフォルダへ */
  async putExtra(name: string, body: Blob, mime: string): Promise<void> {
    const tok = await driveToken(this.s.driveClientId ?? '');
    await putFile(tok, folderIdOf(this.s.driveFolder ?? ''), name, body, mime);
  }
}

export class SupabaseTarget implements SyncTarget {
  readonly name = 'Supabase';
  constructor(private s: StorageSettings) {}
  configured(): boolean { return Boolean(this.s.supabaseUrl && this.s.supabaseSecret); }
  private url(): string { return `${(this.s.supabaseUrl ?? '').replace(/\/$/, '')}/functions/v1/koma-store`; }
  private headers(): Record<string, string> { return { 'content-type': 'application/json', 'x-koma-secret': this.s.supabaseSecret ?? '' }; }
  async pull(): Promise<{ doc: Db; savedAt: ISO } | null> {
    const r = await fetch(this.url(), { headers: this.headers() });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Supabase が返事をしませんでした（HTTP ${r.status}${r.status === 401 ? '＝合言葉が違う' : ''}）`);
    const j = (await r.json()) as { doc: Db; saved_at: ISO } | null;
    return j?.doc ? { doc: j.doc, savedAt: j.doc.savedAt ?? j.saved_at } : null;
  }
  async push(doc: Db): Promise<void> {
    const r = await fetch(this.url(), { method: 'PUT', headers: this.headers(), body: JSON.stringify({ doc }) });
    if (!r.ok) throw new Error(`Supabase に書けませんでした（HTTP ${r.status}）`);
  }
}

export function targetFor(s: StorageSettings | undefined): SyncTarget | null {
  if (!s || s.kind === 'local') return null;
  return s.kind === 'drive' ? new DriveTarget(s) : new SupabaseTarget(s);
}

/** 同期の係＝保存のたびに 3 秒待ってから押し出す。開いたときは外が新しければ取り込む */
export class Syncer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  busy = false;
  constructor(private getDb: () => Db, private setDb: (d: Db) => void, private onState: (msg: string, err?: boolean) => void) {}
  target(): SyncTarget | null { return targetFor(this.getDb().settings.storage); }
  schedulePush(): void {
    const t = this.target(); if (!t?.configured()) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.pushNow(); }, 3000);
  }
  async pushNow(): Promise<void> {
    const t = this.target(); if (!t?.configured() || this.busy) return;
    this.busy = true;
    try { await t.push(this.getDb()); this.mark(null); this.onState(`☁ ${t.name} に保存 ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`); }
    catch (e) { this.mark((e as Error).message); this.onState(`⚠ ${(e as Error).message}`, true); }
    finally { this.busy = false; }
  }
  /** 開いたとき＝外が新しければ取り込む（端末の方が新しければ押し出す） */
  async pullIfNewer(): Promise<'pulled' | 'pushed' | 'same' | 'none'> {
    const t = this.target(); if (!t?.configured()) return 'none';
    this.busy = true;
    try {
      const remote = await t.pull(); const local = this.getDb();
      if (!remote) { await t.push(local); this.mark(null); return 'pushed'; }
      const r = remote.savedAt, l = local.savedAt ?? '';
      if (r > l) { remote.doc.settings.storage = local.settings.storage; this.setDb(remote.doc); this.mark(null); this.onState(`☁ ${t.name} から取り込みました（${r.slice(0, 16).replace('T', ' ')}）`); return 'pulled'; }
      if (l > r) { await t.push(local); this.mark(null); return 'pushed'; }
      this.mark(null); return 'same';
    } catch (e) { this.mark((e as Error).message); this.onState(`⚠ ${(e as Error).message}`, true); return 'none'; }
    finally { this.busy = false; }
  }
  private mark(err: string | null): void { const s = this.getDb().settings.storage; if (s) { s.lastSync = new Date().toISOString(); s.lastError = err ?? undefined; } }
}
