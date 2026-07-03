-- ============================================================
-- 002_favorites.sql — תפריטים שמורים ("לב") + אירוע menu_saved
-- לפי internal/ARCHITECTURE-COACHES.md. offline-first: המקומי
-- (localStorage['shapeat-favorites']) ראשון, הענן מראה משנית.
-- הערת מספור: טבלאות המאמנים עוברות מ-002_coaches ל-003_coaches.
-- הרצה: Supabase Studio → SQL Editor.
-- ============================================================

-- ============ favorites (snapshot של תפריט יום, עצמי בלבד) ============
create table favorites (
  trainee_id  uuid not null references profiles(id) on delete cascade,
  fav_id      uuid not null,               -- נוצר בלקוח (crypto.randomUUID)
  date        date not null,               -- תאריך התפריט (היסטורי מותר — אין check עתיד)
  saved_at    timestamptz not null,        -- שעון לקוח; המאוחר גובר במיזוג
  payload     jsonb not null,              -- פלט serializeDay() כמו-שהוא
  updated_at  timestamptz not null default now(),
  primary key (trainee_id, fav_id),
  check (pg_column_size(payload) < 65536)  -- הגנת גודל 64KB
);

alter table favorites enable row level security;

create policy favorites_select_own on favorites
  for select using (auth.uid() = trainee_id);
create policy favorites_insert_own on favorites
  for insert with check (auth.uid() = trainee_id);
create policy favorites_update_own on favorites
  for update using (auth.uid() = trainee_id) with check (auth.uid() = trainee_id);
create policy favorites_delete_own on favorites
  for delete using (auth.uid() = trainee_id);

-- ============ events: הוספת menu_saved ל-whitelist ============
-- שם ה-constraint נגזר אוטומטית מההגדרה ה-inline ב-001 (events_event_type_check).
alter table events drop constraint events_event_type_check;
alter table events add constraint events_event_type_check
  check (event_type in
    ('menu_built','day_completed','coach_link_visited',
     'signup','coach_connected','consent_revoked','menu_saved'));
