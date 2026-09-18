# TODO — 現在地と次の一手

## 現在地（2026-09-17）

- ✅ Phase 0＝リポ・言葉・枡と 🔁 の規則・端末で動く画面・検査（v1）。
- ✅ v2（2026-09-18）＝GitHub Pages（public・https://yutsutke.github.io/dayslots/ ）／「時間帯なし」を Google に終日で／AI 書き起こしを Phase 2 に。
- ✅ v3（2026-09-18）＝月の画面／一日一回型（座禅）＝1タップ ✅🚫・連続日数・詳細は任意。
- ✅ v4（表示の切替 🕐⏱💬📷）・v5（⊞ すべて＝週の日×種目）・v6（⊞ すべて の 1日＝時刻順の一本／月＝升に種目ごとの印）。
- ✅ v7（⏱ 長さだけの入力）・v8（⏱ 合計・平均／5分刻み＋押しボタン／「今」／🧾 レシート＝📷 → 🤖 BYOK）。
- [ ] 🧾 品目の手直し（読み違いを直す欄）／🧾 と 🍽 の結び付け（同じ食事のレシート）
- [ ] 📷 写真の本体（IndexedDB）は端末の外に出ない＝JSON 書き出しに入らない。Phase 3 で Supabase Storage へ
- ✅ v9（入力層＝合図「座禅開始／散歩終了」・⏵ 進行中・📥 未振り分け・⭐/種目の別名）。
- [ ] 合図の受け口を外に開ける（URL `?say=座禅開始` → Siri のショートカット／ウィジェットから）＝Phase 1 と一緒に
- [ ] 日をまたいだ終了（23:50 開始 → 0:10 終了）は今は終わりを 24:00 に丸めてメモに残す＝2日にまたがる記録の持ち方を決める
- ✅ v10（🎤）・v11（進行中の作法4つ＝自動終了・常時1行・長時間の確認・🚫 は連続を切らない）。調査＝docs/reports/コマ 似たアプリの調査.md（次の一手 16 項目）。
- ✅ v12（並べ替え／保存場所＝端末・Google ドライブ・Supabase／SQLite 書き出し）。
- [ ] ☁ Google ドライブ：本人が Client ID を作って実際に読み書きを確かめる。iOS の殻でログイン窓が開かなければ ネイティブのログイン（@codetrix-studio/capacitor-google-auth 等）に替える
- [ ] ☁ Supabase：どのプロジェクトか決めたら `0002_koma_docs.sql` を当て、`koma-store` を deploy し Secret KOMA_SECRET を入れる
- [ ] ☁ 写真の本体（IndexedDB）は写しに入らない＝Drive/Supabase Storage へ別に置く（Phase 2〜3）
- ▶ 次＝**本人に聞く3つ**（SPEC.md §11：名前／取り込み／Supabase 同じか別か）→ Phase 1（iPhone で触る）。

## Phase 1 — iPhone で触る
- [ ] `npx cap add ios`（Windows でも殻は作れる。`cap sync` は Codemagic 上で）
- [ ] Codemagic: App Store Connect の API キーを `KomaASC` の名前で登録・`signing` グループに `CERTIFICATE_PRIVATE_KEY`（あの日と同じ手順）
- [ ] bundle id を決める（仮 `io.github.yutsutke.koma`）・App Store Connect に app を作る
- [ ] TestFlight で触って直す：升目の横幅（5枡は横スクロール）・板の押しやすさ・時刻入力の使い勝手
- [ ] 記録の板の「なに」に音声入力（iOS のキーボードのマイクで足りるか確かめる）

## Phase 2 — 📷 写真（食事）
- [ ] Capacitor Camera で撮る／写真から選ぶ。長辺 1568 ＋ サムネ 320 に縮小（ライフログと同じ）
- [ ] 升目のチップに写真を出す（週は サムネだけ）
- [ ] 写真の置き場（v1 は端末・Phase 3 で Supabase Storage）。⭐ と共有＝消すときは両方を数える
- [ ] **AI 書き起こし**（決定 2026-09-18）: Edge Function `koma-ai`（ライフログ `meals` 関数の AI の節を写す・鍵は `ai_settings`）。写真 → 要約／詳細／料理の行／出どころ＋理由。status（todo/pending/done/error）を記録に持つ。**数値は作らせない**。人が直した後は読ませ直す前に確かめる（`edited_at`）

## Phase 3 — Supabase の置き場
- [ ] `supabase/migrations/0001_init.sql` を本人が当てる（同じプロジェクトか別か＝先に決める）
- [ ] Edge Function `koma`（合言葉・行単位の読み書き）。`SupabaseStore` を丸ごとでなく行単位に
- [ ] ライフログ `todos`/`meals` の取り込み（一度だけ写す）＝枡の対応表: todos.slot morning→morning, midday→midday, noon→afternoon, evening→evening／meals.slot はそのまま
- [ ] 複数端末の衝突（updated_at の新しい方が勝つ、で足りるか）

## Phase 4 — 📅 Google カレンダー
- [ ] Edge Function `koma-gcal`（`{op:'upsert'|'remove'}`）。ライフログ `gcal` の token 取り回しを写す（7日失効の罠＝本番昇格）。`allDay:true` は Google の終日（date のみ）で作る
- [ ] 設定の「いま送る」→ 記録を保存したら自動で送る（未送信の数を帯に出すのは v1 で済み）
- [ ] 出したものの色（Google のカレンダーを分けるか）

## Phase 5 — 発展（本人と決める）
- [ ] 📊 数える：枡別・種目別の週次（✅ の率、🏠🏪🍴 の比）
- [ ] 期限だけ決まったやること（`due_date`）の 📋 一覧
- [ ] 食事の AI 書き起こし（要るなら）
- [ ] 帯（月の後半など複数日の回）を升目に帯として出す（v1 は開始日に「〜MM-DD」）
- [ ] 記録の並べ替え（升目の中の順・sortOrder は器だけ）

## 今は作らない
- ライフログとの双方向同期（ライフログ側が Google と双方向＝ぶつかる）
- 場所・地図（ライフログの仕事）
- 数値のカロリー等
