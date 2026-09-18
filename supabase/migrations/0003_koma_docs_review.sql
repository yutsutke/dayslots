-- koma_docs.review ＝ 📝 振り返りの要約（AI が読むための、直近7日ぶんの短い文章）
-- なぜ列を分けるか＝doc（写し）は1件 約600文字で id や空の欄だらけ＝AI には重い。要約は 2〜3 千文字。
--   AI は `select review->>'text' from koma_docs where id='default'` の1行で済む（doc を落とさない）。
-- 中身はアプリが作る（src/app/review.ts）＝枡・何分・連続日数の計算をアプリの決まりで済ませてから置く。SQL や AI に同じ規則を書かせない。
alter table public.koma_docs add column if not exists review jsonb;
comment on column public.koma_docs.review is
  '📝 振り返りの要約 {generatedAt, from, to, days, text}。text が読み物の本体（直近7日・種目ごと・時刻と長さと印つき）。アプリが送るたびに作り直す。元の記録ではない＝分析の正は doc';
