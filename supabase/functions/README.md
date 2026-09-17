# Edge Function（まだ無い＝Phase 3・4 で作る）

| 関数 | 役割 | 手本 |
| --- | --- | --- |
| `koma` | 記録・種目・⭐・🔁 の読み書き（合言葉で守る）。画面は表を直に開けない | ライフログ `supabase/functions/todos` `meals` |
| `koma-gcal` | 📅 Google カレンダーへ出す／消す。`{op:'upsert', event, eventId}` `{op:'remove', eventId}` を受ける（呼ぶ形は `src/sync/calendar.ts` の `GoogleViaEdgeFunction`） | ライフログ `supabase/functions/gcal`（refresh token の持ち方・7日失効の罠は `docs/gcal-oauth-setup.md`） |

⚠ 作るときは `supabase/migrations/0001_init.sql` を先に当てる（本人が Supabase の画面で実行する＝Claude の MCP は表の変更を止める）。
