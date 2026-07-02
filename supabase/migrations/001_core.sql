-- ============================================================
-- 001_core.sql — שלב 1: חשבון, היסטוריה, סנכרון (ShapEat)
-- לפי internal/ARCHITECTURE-COACHES.md (המסמך המחייב).
-- טבלאות המאמנים (coaches, coach_links, day_summaries) — במיגרציה 002.
-- הרצה: Supabase Studio → SQL Editor, או supabase db push.
-- ============================================================

-- ============ profiles (מתאמנים; שורה = משתמש מאומת) ============
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  prefs             jsonb,          -- מראה של localStorage['dietai-state'] כפי שהוא
  prefs_updated_at  timestamptz,    -- שעון לקוח, ל-Last-Write-Wins
  created_at        timestamptz not null default now()
);

alter table profiles enable row level security;

create policy profiles_select_own on profiles
  for select using (auth.uid() = id);
create policy profiles_insert_own on profiles
  for insert with check (auth.uid() = id);
create policy profiles_update_own on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- אין delete policy — מחיקה רק דרך delete_my_account() (cascade מ-auth.users)

-- ============ day_logs (היום המלא — פרטי המתאמן בלבד) ============
create table day_logs (
  trainee_id        uuid not null references profiles(id) on delete cascade,
  date              date not null,           -- תאריך מקומי ישראל (שעון לקוח; ראו trigger)
  payload           jsonb not null,          -- פלט serializeDay() כמו-שהוא
  client_updated_at timestamptz not null,    -- ל-LWW בסנכרון רב-מכשירי
  updated_at        timestamptz not null default now(),
  primary key (trainee_id, date),
  check (pg_column_size(payload) < 65536)    -- הגנת גודל 64KB
);

alter table day_logs enable row level security;

-- עצמי בלבד. בשלב 2 המאמן יקבל policy על day_summaries בלבד —
-- על day_logs לא תהיה policy למאמן לעולם (חסימה מבנית).
create policy day_logs_select_own on day_logs
  for select using (auth.uid() = trainee_id);
create policy day_logs_insert_own on day_logs
  for insert with check (auth.uid() = trainee_id);
create policy day_logs_update_own on day_logs
  for update using (auth.uid() = trainee_id) with check (auth.uid() = trainee_id);
create policy day_logs_delete_own on day_logs
  for delete using (auth.uid() = trainee_id);

-- תאריך לא-עתידי, עם סובלנות יום אחד (הפרשי timezone לקוח/שרת)
create or replace function check_day_date() returns trigger
language plpgsql as $$
begin
  if new.date > (now() at time zone 'Asia/Jerusalem')::date + 1 then
    raise exception 'day date too far in the future';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger day_logs_date_check
  before insert or update on day_logs
  for each row execute function check_day_date();

-- ============ events (אנליטיקס פנימי, אנונימי, insert-only) ============
create table events (
  id          bigint generated always as identity primary key,
  event_type  text not null check (event_type in
              ('menu_built','day_completed','coach_link_visited',
               'signup','coach_connected','consent_revoked')),
  anon_id     uuid not null,      -- נוצר בלקוח, נשמר ב-localStorage
  coach_slug  text,
  props       jsonb check (pg_column_size(props) < 2048),
  created_at  timestamptz not null default now()
);
create index events_type_date_idx on events(event_type, created_at);

alter table events enable row level security;

-- כתיבה לכולם (עם ה-checks של הטבלה); קריאה לאף אחד — רק service_role מ-Studio
create policy events_insert_any on events
  for insert to anon, authenticated with check (true);
-- אין select policy בכוונה.

-- ============ delete_my_account (זכות מחיקה — תיקון 13) ============
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();  -- cascade מוחק profiles/day_logs
end $$;

revoke execute on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
