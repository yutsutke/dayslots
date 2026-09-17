# dayslots（コマ・仮）— Claude 向けプロジェクト指示

> 新しいセッションはまず **[SPEC.md](SPEC.md)**（全体像・設計の正典）と **[TODO.md](TODO.md)**（現在地）を読む。

## このプロジェクトの性質

- **iPhone 用の新しいアプリ**。ライフログ（`../owntracks-supabase-notion`）の ◻️ やること と 🍽 食事 を持ち込み、**種目（やること／食事／運動…）× 枡（時間帯）** の骨組みに一般化した。ライフログ本体は触らない（手本として読むだけ）。
- 作り方＝**Capacitor 8 ＋ Vite ＋ TypeScript（枠組み無し）**。iOS は Codemagic で焼く（作法は `../photo-memory-spike/codemagic.yaml`）。
- データ＝v1 は端末（localStorage）。Supabase・Google カレンダーは口（`Store`／`CalendarPort`）だけ先に決めてある。

## 守ること（ライフログから写した憲法）

1. **導出できる値は保存しない**（どの枡か・⭐ を使った回数・「代わりで閉じた」印）。読むときに数える。
2. **意味が違うものを同じ列に入れない**（予定の時刻／実際の時刻・期限／やる日・🚫 未実行／🔁 の例外）。
3. **済んでも消さない**（`doneAt`・`skippedAt` に時刻を残す）。型（⭐）・規則（🔁）を消しても記録は残す。
4. **人が決めた印を自動で上書きしない**（`slotKey`）。
5. **規則は1か所**＝枡の決まりは `src/domain/slots.ts`、🔁 の展開は `src/domain/recur.ts`、操作は `src/app/repo.ts`。画面に規則を書かない。
6. **未来には作らない**（🔁 自動の回は今日まで）。
7. 数値のカロリー等を持たない（写真から分からない数字を作らない）。

## 書き方（ゆうの理解コストを最小に＝`~/.claude/CLAUDE.md` と同じ）

- 専門用語はその行で言い換える。自分で言葉を作らない。カタカナ語を減らす。関数名には役割を一言添える。
- コードのコメントも同じ流儀＝「なぜ」を書く（何をしているかはコードが言う）。

## ファイル構成

```
SPEC.md                 全体像（正典）。設計判断はここに追記
TODO.md / CHANGELOG.md  現在地／やったことの蓄積（セッション終了時に必ず更新）
index.html, src/main.ts 入口
src/domain/             言葉（types）・暦（dates）・枡の決まり（slots）・🔁 の展開（recur）・種目の型（defaults）
src/app/repo.ts         台帳＝画面が呼ぶ操作（✅🚫🔀・⭐・🔁・種目）
src/store/              置き場：localStorage（v1）／Supabase（Phase 3・口だけ）／見本データ（seed）
src/sync/calendar.ts    📅 何を出すか・対応表・Edge Function を呼ぶ口
src/ui/                 画面：app（骨・週・1日）／forms（記録・⭐・🔁 の板）／settings（⚙）／dom（小道具）／style.css
test/                   Vitest（負のテストを含む）
supabase/migrations/    0001_init.sql（⚠ 未適用・Phase 3）
supabase/functions/     README（作る関数の一覧）
capacitor.config.json, codemagic.yaml   iOS の殻（Phase 1）
.claude/launch.json     dev サーバ（port 5276）
```

## 開発の手順

- `npm run dev`（port 5276・他プロジェクトと衝突しない番号）／`npm test`／`npm run build`。
- 触ったら `npm test` と `npm run build`（型検査を含む）を通す。枡や 🔁 の規則を変えたら test を先に直す。
- **セッション終了時**: TODO.md の「現在地」を書き換え、CHANGELOG.md に vN を先頭に足す（背景・設計判断・ハマった所・結果・教訓）。
