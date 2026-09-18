-- koma_docs ＝ コマの文書（JSON 丸ごと1つ）を1行で持つ（⚠ まだ当てていない）
-- なぜ丸ごとか＝v1 は「1人が1台ずつ」の前提で、端末の写しを外に置くだけ。行単位の表（0001_init.sql）へ移すのは Phase 3。
-- 守り＝Edge Function koma-store（合言葉 KOMA_SECRET）だけが触る。RLS オン・ポリシー無し・service_role に grant。
create table if not exists public.koma_docs (
  id          text primary key default 'default',   -- 文書の名前（ふだんは default の1行）
  doc         jsonb not null,                        -- src/domain/types.ts の Db そのまま
  saved_at    timestamptz not null,                  -- 端末が保存した時刻（新しい方が勝つ、の基準）
  updated_at  timestamptz not null default now()
);
alter table public.koma_docs enable row level security;
grant select, insert, update, delete on public.koma_docs to service_role;
comment on table public.koma_docs is 'コマ（dayslots）の文書を丸ごと1行で。Edge Function koma-store 経由。行単位の表は koma_* （0001）';
