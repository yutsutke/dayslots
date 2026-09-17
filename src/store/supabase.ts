/* Supabase の置き場（Phase 3 で実装）。表の形は supabase/migrations/0001_init.sql。
 *  対応: Db.tracks → koma_tracks / entries → koma_entries / templates → koma_templates / rules → koma_rules / calendarMap → koma_calendar_map
 *  作法はライフログと同じ＝画面は Edge Function 経由（合言葉）で読み書きし、anon key で表を直に開けない。
 *  ⚠ ここは「口の形」だけ。load/save を丸ごとではなく行単位（追加・更新・削除）にするのが実装時の宿題（TODO.md Phase 3）。
 */
import type { Db } from '../domain/types';
import type { Store } from './store';

export class SupabaseStore implements Store {
  constructor(private baseUrl: string, private secret: string) {}
  configured(): boolean { return Boolean(this.baseUrl && this.secret); }
  async load(): Promise<Db | null> { throw new Error('Supabase の置き場はまだ作っていません（TODO.md Phase 3）'); }
  async save(_db: Db): Promise<void> { throw new Error('Supabase の置き場はまだ作っていません（TODO.md Phase 3）'); }
}
