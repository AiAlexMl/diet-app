-- ============================================================
-- 011_account_hygiene.sql — מחיקת חשבון של מאמנת, תקרות למשתמש, הקפאת רשומת ההסכמה
-- הרצה: Supabase Studio → SQL Editor (אחרי 010). אחריה: supabase/tests/rls-test.mjs.
--
-- נמצא בסקירת הנתונים 11/11/2026 (קריאת המיגרציות, לא תקיפה בפועל). שלושה דברים,
-- כולם מאותו סוג: הבטחה שהקוד לא מקיים עד הסוף.
-- ============================================================

-- ── 1. מאמנת לא יכלה למחוק את החשבון שלה ──
-- coaches.user_id הצביע על auth.users **בלי** on delete, כלומר NO ACTION: מחיקת המשתמש
-- נכשלת כל עוד יש שורת coaches שמצביעה עליו. delete_my_account() היה נופל אצל כל מי
-- שתבעה פרופיל מאמנת — בזמן ש-privacy.html (סעיף 7) מבטיח מחיקה לכל בעל חשבון, והמסמך
-- המחייב אומר "cascade מוחק הכל".
-- (רמז שזה כבר קרה: הניקוי של rls-test מוחק את משתמש המאמנת בתוך try/catch ריק.)
--
-- ⇒ cascade, כמו בכל שאר הטבלאות: החשבון נמחק ⇒ פרופיל המאמנת נמחק ⇒ הקישורים
--   למתאמנות נמחקים (coach_links כבר on delete cascade מ-coaches) ⇒ המיתוג יורד
--   מ-coaches_public. המתאמנות עצמן והנתונים שלהן לא נפגעים.
-- ⚠️ מה שנשאר ידני (הריפו, לא ה-DB): `c/<slug>/` ו-`coaches.json`. ראו coach-onboarding.md.
alter table coaches drop constraint if exists coaches_user_id_fkey;
alter table coaches add constraint coaches_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- ── 2. תקרות למשתמש ──
-- התקרה של 30 מועדפים קיימת רק בדפדפן. מול ה-API משתמש מחובר יכול היה לכתוב מועדפים
-- וימים בלי הגבלה (64KB כל אחד), ול-profiles.prefs לא הייתה מגבלת גודל בכלל ⇒ אפשר
-- למלא את 500MB של ה-free tier, ואז הכתיבות של כולם נכשלות. אותה בעיה ש-010 סגר
-- ב-events, רק מאחורי התחברות.
--
-- שלושה מנגנונים, לפי אופי הטבלה:
--   · profiles.prefs  — מגבלת גודל (שורה אחת למשתמש).
--   · day_logs / day_summaries — חלון תאריכים: לא יותר מ-7 ימים אחורה. הלקוח כותב רק
--     את היום הנוכחי, אז החלון בלתי נראה בשימוש רגיל, ומגביל את קצב המילוי ל-9 שורות
--     ביום לחשבון.
--   · favorites / weight_logs — תקרת שורות (שם תאריך היסטורי הוא שימוש לגיטימי).
-- כולם חלים רק על לקוחות (authenticated/anon). service_role ו-SQL Editor פטורים —
-- אחרת שחזור מגיבוי (internal/backup-data.mjs --restore) היה נדחה על תאריכים ישנים.

alter table profiles drop constraint if exists profiles_prefs_size;
alter table profiles add constraint profiles_prefs_size
  check (prefs is null or pg_column_size(prefs) < 16384);   -- 16KB; prefs אמיתי ~1-2KB

create or replace function is_client_role() returns boolean
language sql stable set search_path = ''
as $$ select coalesce(auth.role(), '') in ('authenticated', 'anon'); $$;

-- מחליף את הטריגר מ-001 (משותף ל-day_logs ול-day_summaries): מוסיף גבול תחתון
create or replace function check_day_date() returns trigger
language plpgsql as $$
declare today date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  if new.date > today + 1 then
    raise exception 'day date too far in the future';
  end if;
  if public.is_client_role() and new.date < today - 7 then
    raise exception 'day date too far in the past';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- תקרת שורות למשתמש. tg_argv[0] = התקרה, tg_argv[1] = עמודת המפתח השנייה (fav_id / date).
-- ⚠️ BEFORE INSERT יורה גם ב-upsert של שורה **קיימת** (insert ... on conflict do update),
--    ולכן שורה שכבר קיימת תמיד עוברת — אחרת משתמש שהגיע לתקרה לא היה יכול לעדכן מועדף.
-- רץ בהרשאות המשתמש (לא DEFINER): ה-RLS מראה לו בדיוק את השורות שלו, וזה מה שסופרים.
create or replace function cap_rows_per_user() returns trigger
language plpgsql as $$
declare n int; found boolean;
begin
  if not public.is_client_role() then return new; end if;
  execute format(
    'select count(*), coalesce(bool_or(%1$I::text = $2), false) from %2$I.%3$I where trainee_id = $1',
    tg_argv[1], tg_table_schema, tg_table_name)
    into n, found
    using new.trainee_id, to_jsonb(new) ->> tg_argv[1];
  if not found and n >= tg_argv[0]::int then
    raise exception 'row limit reached (%)', tg_table_name;
  end if;
  return new;
end $$;

drop trigger if exists favorites_cap on favorites;
create trigger favorites_cap
  before insert on favorites
  for each row execute function cap_rows_per_user('100', 'fav_id');   -- הלקוח שומר עד 30

drop trigger if exists weight_logs_cap on weight_logs;
create trigger weight_logs_cap
  before insert on weight_logs
  for each row execute function cap_rows_per_user('1500', 'date');    -- ~4 שנים של שקילה יומית

-- ── 3. רשומת ההסכמה קפואה גם ברגע הניתוק ──
-- coach_links_guard מ-004 הקפיא trainee_id/coach_id/share_weight/consent_at, אבל לא את
-- שם התצוגה, המטרה, **גרסת נוסח ההסכמה** ותאריך היצירה. ה-policy מרשה גם למאמנת לבצע
-- את העדכון active→revoked, כלומר ברגע ההסרה היא יכלה לשכתב את השם ואת הגרסה של
-- ההסכמה שהמתאמנת נתנה. רשומת הסכמה שאפשר לערוך אינה ראיה.
create or replace function coach_links_guard() returns trigger
language plpgsql as $$
begin
  if old.status <> 'active' or new.status <> 'revoked' then
    raise exception 'only active -> revoked is allowed';
  end if;
  if new.trainee_id is distinct from old.trainee_id
     or new.coach_id is distinct from old.coach_id
     or new.share_weight is distinct from old.share_weight
     or new.consent_at is distinct from old.consent_at
     or new.trainee_display_name is distinct from old.trainee_display_name
     or new.trainee_goal is distinct from old.trainee_goal
     or new.consent_text_version is distinct from old.consent_text_version
     or new.created_at is distinct from old.created_at then
    raise exception 'protected column';
  end if;
  new.revoked_at := now();
  return new;
end $$;

-- ── מה נשאר כמו שהוא, ולמה ──
-- מאמנת עדיין יכולה לקרוא את שורת הקישור אחרי ניתוק (שם תצוגה, מטרה, תאריכים — מה
-- שכבר ראתה). לסנן לפי status ב-policy ה-SELECT היה שובר את ההסרה עצמה: ב-UPDATE
-- פוסטגרס בודק את ה-SELECT policy גם על השורה **החדשה** (revoked), והעדכון היה נדחה.
-- הפתרון הנכון הוא RPC ייעודי להסרה; לא שווה את השינוי בלקוח בשלב הזה.
