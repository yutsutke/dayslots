import { describe, it, expect } from 'vitest';
import { forExport } from '../src/sync/target';
import { seedDb } from '../src/store/seed';

describe('☁ 外の写し', () => {
  it('鍵（🤖 BYOK）と保存場所の設定は外に送らない。記録・種目・⭐・🔁 はそのまま', () => {
    const db = seedDb('2026-09-17');
    db.settings.ai = { provider: 'anthropic', key: 'sk-ant-secret', model: 'm' };
    db.settings.storage = { kind: 'supabase', supabaseUrl: 'https://x.supabase.co', supabaseSecret: 'pw' };
    const out = forExport(db);
    expect(JSON.stringify(out)).not.toMatch(/sk-ant-secret|pw|supabaseSecret/);
    expect(out.settings.ai).toBeUndefined(); expect(out.settings.storage).toBeUndefined();
    expect(out.tracks.length).toBe(db.tracks.length); expect(out.entries.length).toBe(db.entries.length);
    expect(out.settings.weekStart).toBe(db.settings.weekStart);
    expect(db.settings.ai?.key).toBe('sk-ant-secret'); // 元は触らない
  });
});
