-- コマ（仮）の表（Phase 3 で本番に当てる＝⚠ まだ当てていない）
-- =============================================================================
-- 形は src/domain/types.ts と1対1。列名は snake_case、値の守りはここ（最後の砦）にも置く＝ライフログと同じ流儀。
-- ライフログ（jiqbulwzgijoweiicfng）と同じプロジェクトに置く前提で、表の名前に koma_ を付けて衝突を避ける。
-- 別プロジェクトに置く判断になったら prefix を外してよい（画面は表名を知らない＝Edge Function 経由）。
--
-- ★設計の芯
--   ①枡の境目は表に持たない（tracks.slots の JSON に「始まり」だけ）＝記録に焼き込まない＝読むときに導く
--   ②予定と実際は別の列（plan_* / actual_*）。期限は持たない（ライフログ todos.due_date は今は写さない＝要るとき足す）
--   ③✅（done_at）と 🚫（skipped_at）は両立しない＝CHECK
--   ④🔀 は代わりの側の1列（instead_of_id）だけ。自分を自分の代わりにしない＝CHECK
--   ⑤(rule_id, rule_date) は unique ＝ 同じ回を二重に作らない
--   ⑥型（templates）・規則（rules）を消しても記録は残る＝on delete set null
--   ⑦数値のカロリー等は持たない（payload にも入れない約束＝アプリ側で守る）
-- =============================================================================

create table if not exists public.koma_tracks (
  id            uuid primary key,
  name          text not null check (char_length(name) between 1 and 60),
  icon          text not null default '📌',
  kind          text not null check (kind in ('todo', 'meal', 'activity', 'habit', 'custom')),
  slots         jsonb not null default '[]'::jsonb,   -- [{key,label,icon,startMin|null,endMin?}] 表示順
  fallback_key  text not null,                         -- 受け皿の枡
  features      jsonb not null default '{}'::jsonb,   -- {done,photos,calendar,actualFirst}
  sort_order    int  not null default 0,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.koma_templates (
  id            uuid primary key,
  track_id      uuid not null references public.koma_tracks(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 100),
  slot_key      text,
  title         text not null,
  note          text,
  payload       jsonb not null default '{}'::jsonb,
  photos        jsonb not null default '[]'::jsonb,   -- 記録と共有（実体は増やさない＝削除は両方を数えてから）
  plan_start    int check (plan_start is null or plan_start between 0 and 1439),
  plan_end      int check (plan_end   is null or plan_end   between 0 and 1440),
  plan_dur      int check (plan_dur   is null or plan_dur   between 1 and 1440),
  calendar      boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.koma_rules (
  id            uuid primary key,
  track_id      uuid not null references public.koma_tracks(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  note          text,
  payload       jsonb not null default '{}'::jsonb,
  template_id   uuid references public.koma_templates(id) on delete set null,
  freq          text not null check (freq in ('daily','weekly','everyN','monthly','monthhalf','monthfull','monthrange',
                                              'weekday','holiday','beforeoff','notbeforeoff','firstworkday','lastworkday','runstart','runend')),
  byday         smallint[] not null default '{}',
  interval      int check (interval is null or interval between 1 and 365),
  half          text check (half is null or half in ('first', 'second')),
  day_from      smallint, day_to smallint,
  start_date    date not null,
  end_date      date,
  slot_key      text,
  plan_start    int check (plan_start is null or plan_start between 0 and 1439),
  plan_end      int check (plan_end   is null or plan_end   between 0 and 1440),
  plan_dur      int check (plan_dur   is null or plan_dur   between 1 and 1440),
  priority      smallint not null default 0 check (priority between -1 and 1),
  tag           text,
  auto          boolean not null default false,       -- true＝その日が来たら自動／false＝押した日だけ
  active        boolean not null default true,
  calendar      boolean not null default false,
  exceptions    jsonb not null default '{}'::jsonb,   -- {"2026-09-20": {"del": true}}
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint koma_rules_dayrange check ((day_from is null and day_to is null) or (day_from between 1 and 31 and day_to between 1 and 31 and day_from <= day_to)),
  constraint koma_rules_dates check (end_date is null or end_date >= start_date)
);

create table if not exists public.koma_entries (
  id            uuid primary key,
  track_id      uuid not null references public.koma_tracks(id) on delete cascade,
  date          date not null,                         -- やる日／食べた日
  slot_key      text,                                  -- 人が選んだ枡（null＝時刻から）
  plan_start    int check (plan_start is null or plan_start between 0 and 1439),
  plan_end      int check (plan_end   is null or plan_end   between 0 and 1440),
  plan_dur      int check (plan_dur   is null or plan_dur   between 1 and 1440),   -- 予定の長さ（分）＝時刻と無関係に「30分やる」
  actual_date   date,
  actual_start  int check (actual_start is null or actual_start between 0 and 1439),
  actual_end    int check (actual_end   is null or actual_end   between 0 and 1440),
  actual_dur    int check (actual_dur   is null or actual_dur   between 1 and 1440), -- 実際の長さ（分）＝「20分やった」だけの入力
  done_at       timestamptz,
  skipped_at    timestamptz,
  instead_of_id uuid references public.koma_entries(id) on delete set null,
  title         text not null check (char_length(title) between 1 and 300),
  note          text,
  priority      smallint not null default 0 check (priority between -1 and 1),
  tag           text,
  template_id   uuid references public.koma_templates(id) on delete set null,
  rule_id       uuid references public.koma_rules(id) on delete set null,
  rule_date     date,
  photos        jsonb not null default '[]'::jsonb,
  payload       jsonb not null default '{}'::jsonb,
  calendar      boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint koma_entries_done_or_skipped check (done_at is null or skipped_at is null),
  constraint koma_entries_instead_not_self check (instead_of_id is null or instead_of_id <> id),
  constraint koma_entries_plan_order check (plan_start is null or plan_end is null or plan_end >= plan_start),
  constraint koma_entries_actual_order check (actual_start is null or actual_end is null or actual_end >= actual_start),
  constraint koma_entries_actual_needs_day check (actual_start is null or actual_date is not null)
);
create index if not exists koma_entries_track_date_idx on public.koma_entries (track_id, date);
create unique index if not exists koma_entries_rule_uni on public.koma_entries (rule_id, rule_date) where rule_id is not null;
create index if not exists koma_entries_template_idx on public.koma_entries (template_id) where template_id is not null;

-- 📅 記録 ⇔ Google の予定（ライフログ gcal_map の小さい版）
create table if not exists public.koma_calendar_map (
  entry_id      uuid primary key references public.koma_entries(id) on delete cascade,
  provider      text not null default 'google',
  event_id      text not null,
  content_hash  text,                                  -- 同じ中身なら書かない（往復のこだま止め）
  synced_at     timestamptz not null default now(),
  unique (provider, event_id)
);

-- RLS オン・ポリシー無し＝service_role（Edge Function）だけが触る。⚠ grant を忘れると 42501 で 500（ライフログで踏んだ罠）
alter table public.koma_tracks        enable row level security;
alter table public.koma_templates     enable row level security;
alter table public.koma_rules         enable row level security;
alter table public.koma_entries       enable row level security;
alter table public.koma_calendar_map  enable row level security;
grant select, insert, update, delete on public.koma_tracks, public.koma_templates, public.koma_rules, public.koma_entries, public.koma_calendar_map to service_role;
