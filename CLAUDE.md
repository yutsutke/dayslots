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
8. **大きいものは記録に埋めない**（指で示す）。写真の本体も、いずれ来る長い文章も。記録は「読んで意味が取れる最小限」に保つ。

## 書き方（ゆうの理解コストを最小に＝`~/.claude/CLAUDE.md` と同じ）

- 専門用語はその行で言い換える。自分で言葉を作らない。カタカナ語を減らす。関数名には役割を一言添える。
- コードのコメントも同じ流儀＝「なぜ」を書く（何をしているかはコードが言う）。

## ファイル構成

```
SPEC.md                 全体像（正典）。設計判断はここに追記
TODO.md / CHANGELOG.md  現在地／やったことの蓄積（セッション終了時に必ず更新）
docs/reports/           似たアプリの調査（次の一手 16 項目）。docs/research_notes/ はその元の調査ノート
index.html, src/main.ts 入口
src/domain/             言葉（types）・暦（dates）・枡の決まり（slots＝長さ durationOf もここ）・🔁 の展開（recur）・種目の型（defaults）・合図を解く（signal）・☀ 日の出/日の入り（sun）・1日の始まり＝どの日に見せるか（viewday）・ズレ＝予定と実際の差（gap）・⏭ 先送り＝やる日を動かした履歴の読み方（postpone）・N日のひと区切り（cycle）・📷 手の形の顔ぶれと対応表（gesture）・📆 長い期間の窓と「たまにしかやらないこと」の数（span）・📷 記録に埋まったサムネを外へ移す段取り（thumbs）・🗓 記念日の節目/🔔/経過日数（milestones＝ライフログと同じ決まり）・タブの見せる／畳む（tabs）
src/app/repo.ts         台帳＝画面が呼ぶ操作（✅🚫🔀・⭐・🔁・種目・一日一回・合図 applySignal・進行中・並べ替え）
src/app/review.ts       📝 振り返りの要約（AI が読む直近7日の読み物）
src/ai/byok.ts          🤖 本人の鍵で AI を呼ぶ。呼び先の違いは PROVIDERS の1枚（Anthropic／Gemini／OpenRouter）＝足すのは1行。モデルの一覧は先方に聞く（決め打ちの表を持たない）。返事は検査してから使い、鍵はエラー文にも出さない
src/store/              置き場：localStorage（本体）／見本データ（seed）／supabase.ts は古い口（使っていない）
src/sync/               milestones（🗓 ライフログの記念日を読む・足す・直す・消す口＝関数 koma-milestones）／calendar（📅 何を出すか）／target（☁ 外の写し＝Syncer・送る期間・初回は聞く）／delta（差分を作る・当てる）／drive（Google ドライブ）
src/export/sqlite.ts    SQLite の書き出し（sql.js を書き出すときだけ読む）
src/ui/                 app（骨・週/1日/月・すべて・合図の欄・進行中の1行）／forms（記録・⭐・🔁・📷🤖）／settings（⚙）／photos（縮小・IndexedDB＝本体とサムネの2つの棚・サムネを出す thumbImg）／milestones（🗓 一覧・1件の板・日の見出しの印・記念日のタブの中身 msTabBody）／voice（🎤）／dom／style.css
test/                   Vitest 220 本（負のテストを含む）
supabase/migrations/    0001（行単位の表・未適用）／0002 koma_docs・0003 review（**本番に適用済み**）
supabase/functions/koma-store/  外の写しの関数（index.ts ＋ delta.ts＝src/sync/delta.ts の写し。検査が一致を見る）
supabase/functions/koma-milestones/  🗓 ライフログの表 milestones・milestone_logs を読む／足す／直す／消す（写真の列には書かない・消すときだけ `<uuid>.jpg` の実体を消す。**本番に置いた** v2）
capacitor.config.json, codemagic.yaml, ios/   iOS の殻（Phase 1）
.claude/launch.json     dev サーバ（port 5276）
```

### 触るときの罠（この2日で踏んだもの）
- **Bash の heredoc に日本語やバックスラッシュを含む長い中身を入れると壊れる** → ファイルは Write／Edit で。まとめて直すときは Python の直しスクリプトを Write で作ってから実行。
- **関数 koma-store を置き直すときは index.ts と delta.ts の2つとも渡す**（MCP の deploy_edge_function・verify_jwt=false）。delta.ts を直したら `supabase/functions/koma-store/delta.ts` にも同じものを置く（検査が落ちて気づける）。
- Deno の Edge Function は **OPTIONS に本文つきの 204 を返すと 500**（ブラウザでは Failed to fetch）。
- preview_start が port 5276 を握ると、本人の `npm run dev` が「already in use」になる → 確かめ終わったら preview_stop。
- **範囲の端に 9999 年のような遠い日を渡さない**＝🔁 の回を1日ずつ数える処理が固まる（v17 のリストで踏んだ。`occurrences()` は3年で切る砦つき）。プレビューが「timed out」で固まったら、まずページ側の無限に近いループを疑う。
- 2026-09-22 は国民の休日（9/19〜23 が5連休）＝🔁 の検査の日付を選ぶときに注意。

## 開発の手順

- `npm run dev`（port 5276・他プロジェクトと衝突しない番号）／`npm test`／`npm run build`。
- 触ったら `npm test` と `npm run build`（型検査を含む）を通す。枡や 🔁 の規則を変えたら test を先に直す。
- **検査が通ったら、PR を作ってそのまま main にマージする**（2026-09-23・ゆう「基本メインにマージして」）＝「マージしてよいか」を聞いて止まらない。流儀は squash（1つの PR が main の1コミット）。マージ後は GitHub Pages の更新が通ったかまで見る。⚠ 本番のデータを消す・壊す恐れがあるもの、本人の判断が要る設計は、今までどおり先に聞く（「マージしてよい」は手順の許可であって、中身の判断まで任されたわけではない）。
- **セッション終了時**: TODO.md の「現在地」を書き換え、CHANGELOG.md に vN を先頭に足す（背景・設計判断・ハマった所・結果・教訓）。
