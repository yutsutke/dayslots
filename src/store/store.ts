/* 置き場（Store）＝丸ごと1つの文書（Db）を読む・書くだけの薄い口。
 *  いまは端末（localStorage）。Supabase に移すときはこの口の後ろだけ替える（画面と規則は触らない）。
 */
import type { Db } from '../domain/types';

export interface Store {
  load(): Promise<Db | null>;
  save(db: Db): Promise<void>;
}

export class MemoryStore implements Store {
  constructor(private db: Db | null = null) {}
  async load(): Promise<Db | null> { return this.db ? structuredClone(this.db) : null; }
  async save(db: Db): Promise<void> { this.db = structuredClone(db); }
}

export class LocalStore implements Store {
  constructor(private key = 'dayslots.db') {}
  async load(): Promise<Db | null> {
    try { const s = localStorage.getItem(this.key); return s ? (JSON.parse(s) as Db) : null; } catch { return null; }
  }
  async save(db: Db): Promise<void> {
    try { localStorage.setItem(this.key, JSON.stringify(db)); } catch (e) { console.warn('保存できませんでした', e); }
  }
}
