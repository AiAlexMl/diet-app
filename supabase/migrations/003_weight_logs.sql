-- ============================================================
-- 003_weight_logs.sql — מעקב משקל v1 (גרף התקדמות אישי)
-- לפי internal/ROADMAP.md ("מעקב משקל v1 — מפרט מוקפא", grilling 11/07/2026).
-- offline-first: המקומי (localStorage['shapeat-weights']) ראשון, הענן מראה משנית + מזין מגמה עתידית למאמן.
-- ⚠️ הערת מספור: טבלאות המאמנים (coaches/coach_links/day_summaries) עוברות ל-004_coaches (היו מיועדות ל-003).
-- הרצה: Supabase Studio → SQL Editor.
-- ============================================================

-- ============ weight_logs (שקילות, שורה ליום, עצמי בלבד) ============
create table weight_logs (
  trainee_id        uuid not null references profiles(id) on delete cascade,
  date              date not null,           -- תאריך השקילה (מקומי; היסטורי מותר)
  weight_kg         numeric(5,2) not null,   -- ק"ג
  client_updated_at timestamptz not null,    -- שעון לקוח; המאוחר גובר במיזוג (LWW), כמו day_logs
  updated_at        timestamptz not null default now(),
  primary key (trainee_id, date),
  check (weight_kg >= 20 and weight_kg <= 400)   -- שפיות ברמת DB (רחב מה-clamp בלקוח 30–300)
);

alter table weight_logs enable row level security;

-- עצמי בלבד. בשלב 2 המאמן יקבל מגמה מופשטת דרך שכבת day_summaries/פונקציה ייעודית —
-- על weight_logs עצמה לא תהיה policy למאמן לעולם (חסימה מבנית, כמו day_logs).
create policy weight_logs_select_own on weight_logs
  for select using (auth.uid() = trainee_id);
create policy weight_logs_insert_own on weight_logs
  for insert with check (auth.uid() = trainee_id);
create policy weight_logs_update_own on weight_logs
  for update using (auth.uid() = trainee_id) with check (auth.uid() = trainee_id);
create policy weight_logs_delete_own on weight_logs
  for delete using (auth.uid() = trainee_id);

-- תאריך לא-עתידי, עם סובלנות יום אחד (הפרשי timezone לקוח/שרת) — זהה ל-day_logs
create or replace function check_weight_date() returns trigger
language plpgsql as $$
begin
  if new.date > (now() at time zone 'Asia/Jerusalem')::date + 1 then
    raise exception 'weight date too far in the future';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger weight_logs_date_check
  before insert or update on weight_logs
  for each row execute function check_weight_date();
