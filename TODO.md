# TODO — 現在地と次の一手

## 現在地（2026-09-17）

- ✅ Phase 0＝リポ・言葉・枡と 🔁 の規則・端末で動く画面・検査（v1）。
- ▶ 次＝**本人に聞く5つ**（SPEC.md §11：名前／取り込み／Supabase 同じか別か／AI 書き起こし／時間帯なしの終日）→ Phase 1（iPhone で触る）。

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

## Phase 3 — Supabase の置き場
- [ ] `supabase/migrations/0001_init.sql` を本人が当てる（同じプロジェクトか別か＝先に決める）
- [ ] Edge Function `koma`（合言葉・行単位の読み書き）。`SupabaseStore` を丸ごとでなく行単位に
- [ ] ライフログ `todos`/`meals` の取り込み（一度だけ写す）＝枡の対応表: todos.slot morning→morning, midday→midday, noon→afternoon, evening→evening／meals.slot はそのまま
- [ ] 複数端末の衝突（updated_at の新しい方が勝つ、で足りるか）

## Phase 4 — 📅 Google カレンダー
- [ ] Edge Function `koma-gcal`（`{op:'upsert'|'remove'}`）。ライフログ `gcal` の token 取り回しを写す（7日失効の罠＝本番昇格）
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
