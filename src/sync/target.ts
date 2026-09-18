/* 保存場所（同期先）＝端末の保存箱（localStorage）はいつも使い、その**写し**を外に置く。
 *  ・端末のみ＝写しを置かない
 *  ・Google ドライブ＝本人のフォルダに koma.json（＋SQLite の書き出し）
 *  ・Supabase＝Edge Function `koma-store` が表 koma_docs に丸ごと1行で持つ（合言葉で守る）
 *  ぶつかったとき＝**新しい方（savedAt）が勝つ**。開いたときに外の方が新しければ取り込み、保存のたびに少し待ってから押し出す。
 *  ⚠ 行単位の同期（複数端末で同時に書く）は Phase 3 の宿題。いまは「1人が1台ずつ使う」を前提にした丸ごと同期。
 */
import type { Db, ISO, YMD } from '../domain/types';
import { todayYMD, addDays } from '../domain/dates';
import { driveToken, folderIdOf, findFile, putFile, getFileText } from './drive';
import { buildDelta, type Delta, type DocLike } from './delta';

export type StorageKind = 'local' | 'drive' | 'supabase';
export interface StorageSettings {
  kind: StorageKind;
  windowDays?: number | null; // 送る期間（日）。null/省略＝すべて。31＝直近1か月ぶんだけ送る（まとめて分析したいときだけ長くする）
  driveClientId?: string;   // Google Cloud で作る OAuth の Client ID（ウェブ）
  driveFolder?: string;     // フォルダの URL か ID
  supabaseUrl?: string;     // https://xxxx.supabase.co
  supabaseSecret?: string;  // koma-store の合言葉
  lastPushedAt?: ISO;       // 最後に送れた時刻＝これより後に変わった記録が「差分」
  remoteSavedAt?: ISO;      // そのとき外の写しが持っていた savedAt＝差分を当てる土台の確認に使う
  lastSync?: ISO;           // 最後に外と合わせた時刻
  lastError?: string;
}

export interface SyncTarget {
  readonly name: string;
  configured(): boolean;
  /** 外の写し（無ければ null）。since を渡し、外がそれより新しくなければ中身を落とさず { same } を返せる */
  pull(since?: ISO): Promise<{ doc: Db; savedAt: ISO } | { same: true; savedAt: ISO } | null>;
  push(doc: Db): Promise<void>;
  /** 差分だけ送る（できる所だけ）。'conflict'＝外の土台が違う → 呼び手が丸ごと送り直す */
  pushDelta?(d: Delta): Promise<'ok' | 'conflict'>;
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
  async pull(since?: ISO): Promise<{ doc: Db; savedAt: ISO } | { same: true; savedAt: ISO } | null> {
    const r = await fetch(this.url() + (since ? `?since=${encodeURIComponent(since)}` : ''), { headers: this.headers() });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Supabase が返事をしませんでした（HTTP ${r.status}${r.status === 401 ? '＝合言葉が違う' : ''}）`);
    const j = (await r.json()) as { doc?: Db; saved_at: ISO; same?: boolean } | null;
    if (j?.same) return { same: true, savedAt: j.saved_at };
    return j?.doc ? { doc: j.doc, savedAt: j.doc.savedAt ?? j.saved_at } : null;
  }
  async pushDelta(d: Delta): Promise<'ok' | 'conflict'> {
    const r = await fetch(this.url(), { method: 'PUT', headers: this.headers(), body: JSON.stringify({ delta: d }) });
    if (r.status === 409) return 'conflict';
    if (!r.ok) throw new Error(`Supabase に書けませんでした（HTTP ${r.status}）`);
    return 'ok';
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

/** 外に出す形。
 *  ・鍵（🤖 BYOK）と保存場所の設定は**送らない**（鍵は端末ごとに入れる・外の写しに秘密を置かない）
 *  ・送る期間（windowDays）があれば、記録は**その日から先のぶんだけ**（種目・⭐・🔁・設定はいつも全部＝小さい）。
 *    写しに window.from を書いておく＝取り込む側が「この日より前は入っていない」と分かる */
export function forExport(doc: Db, today: YMD = todayYMD()): Db {
  const { ai: _ai, storage: st, ...rest } = doc.settings;
  const days = st?.windowDays ?? null;
  if (!days || days <= 0) return { ...doc, window: null, settings: rest as Db['settings'] };
  const from = addDays(today, -days);
  const keep = new Set(doc.entries.filter((e) => e.date >= from || (e.actualDate ?? '') >= from).map((e) => e.id));
  return { ...doc, window: { from }, entries: doc.entries.filter((e) => keep.has(e.id)), calendarMap: doc.calendarMap.filter((m) => keep.has(m.entryId)), settings: rest as Db['settings'] };
}
/** 取り込む形。
 *  ・この端末の鍵と保存場所の設定を戻す
 *  ・外の写しが期間つき（window.from）なら、**その日から先だけ**を外のもので置き換え、それより前の記録は端末のものを残す
 *    （残さないと、1か月ぶんの写しを取り込んだ瞬間に古い記録が端末から消える） */
export function mergeRemote(remote: Db, local: Db): Db {
  const settings = { ...remote.settings, ai: local.settings.ai, storage: local.settings.storage };
  const from = remote.window?.from;
  if (!from) return { ...remote, window: null, settings };
  const inWin = (e: { date: YMD; actualDate: YMD | null }) => e.date >= from || (e.actualDate ?? '') >= from;
  const old = local.entries.filter((e) => !inWin(e));
  const oldIds = new Set(old.map((e) => e.id));
  return { ...remote, window: null, entries: [...old, ...remote.entries.filter((e) => !oldIds.has(e.id))], calendarMap: [...local.calendarMap.filter((m) => oldIds.has(m.entryId)), ...remote.calendarMap], settings };
}

/** 同期の係＝保存のたびに 3 秒待ってから押し出す。開いたときは外が新しければ取り込む */
export class Syncer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  busy = false;
  constructor(private getDb: () => Db, private setDb: (d: Db) => void, private onState: (msg: string, err?: boolean) => void, private saveQuiet: () => void = () => {}) {}
  target(): SyncTarget | null { return targetFor(this.getDb().settings.storage); }
  schedulePush(): void {
    const t = this.target(); if (!t?.configured()) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.pushNow(); }, 3000);
  }
  async pushNow(): Promise<void> {
    const t = this.target(); if (!t?.configured() || this.busy) return;
    this.busy = true;
    try { const how = await this.send(t); this.mark(null); this.onState(`☁ ${t.name} に保存 ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}（${how}）`); }
    catch (e) { this.mark((e as Error).message); this.onState(`⚠ ${(e as Error).message}`, true); }
    finally { this.busy = false; }
  }
  /** 送る＝できれば差分（前回送ってから変わった記録＋消した id）、だめなら丸ごと。送れたら印を残して「消した id」を空にする */
  private async send(t: SyncTarget): Promise<string> {
    const db = this.getDb(); const s = db.settings.storage; const started = new Date().toISOString();
    const out = forExport(db); let how = '丸ごと';
    const sentDeletes = [...(db.deleted ?? [])];
    if (t.pushDelta && s?.lastPushedAt && s.remoteSavedAt) {
      const d = buildDelta(out as unknown as DocLike, s.lastPushedAt, s.remoteSavedAt, sentDeletes);
      if ((await t.pushDelta(d)) === 'ok') how = `差分 ${d.upserts.length} 件${d.deletes.length ? `・削除 ${d.deletes.length}` : ''}`;
      else await t.push(out);
    } else await t.push(out);
    if (s) { s.lastPushedAt = started; s.remoteSavedAt = out.savedAt ?? ''; }
    db.deleted = (db.deleted ?? []).filter((id) => !sentDeletes.includes(id));
    this.saveQuiet();
    return how;
  }
  /** 開いたとき＝外が新しければ取り込む（端末の方が新しければ押し出す） */
  async pullIfNewer(): Promise<'pulled' | 'pushed' | 'same' | 'none'> {
    const t = this.target(); if (!t?.configured()) return 'none';
    this.busy = true;
    try {
      const local = this.getDb();
      const remote = await t.pull(local.savedAt); // 外が新しくなければ中身は落ちてこない
      if (!remote) { await this.send(t); this.mark(null); return 'pushed'; }
      const r = remote.savedAt, l = local.savedAt ?? '';
      if (!('same' in remote) && new Date(r).getTime() > new Date(l).getTime()) {
        const s = local.settings.storage; if (s) { s.lastPushedAt = new Date().toISOString(); s.remoteSavedAt = remote.doc.savedAt ?? r; }
        const m = mergeRemote(remote.doc, local); m.deleted = [];
        this.setDb(m); this.mark(null); this.onState(`☁ ${t.name} から取り込みました（${r.slice(0, 16).replace('T', ' ')}）`); return 'pulled';
      }
      if (new Date(l).getTime() > new Date(r).getTime()) { await this.send(t); this.mark(null); return 'pushed'; }
      this.mark(null); return 'same';
    } catch (e) { this.mark((e as Error).message); this.onState(`⚠ ${(e as Error).message}`, true); return 'none'; }
    finally { this.busy = false; }
  }
  private mark(err: string | null): void { const s = this.getDb().settings.storage; if (s) { s.lastSync = new Date().toISOString(); s.lastError = err ?? undefined; } }
}
