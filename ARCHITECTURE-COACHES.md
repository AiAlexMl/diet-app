# ארכיטקטורת שכבת המאמנים (B2B White-Label) — ShapEat

> מסמך התכנון המחייב לצד המאמנים. נכתב 01/07/2026 אחרי סבב הכרעות עם אלכס.
> משלים את `ROADMAP.md` (האסטרטגיה והמודל העסקי שם; הארכיטקטורה הטכנית כאן).

## הכרעות מחייבות (01/07/2026)

1. **Auth מדורג**: אנונימי כברירת מחדל לתמיד ← הצעה רכה ל-Google אחרי קבלת ערך ← **חובה רק בחיבור למאמן** (הסכמה מפורשת). שיטות: Google OAuth + magic link. בלי SMS (עולה כסף פר הודעה, מיותר).
2. **מאמנים באישור ידני** של אלכס (פיילוט מבוקר). self-serve רק אחרי ביקוש מוכח.
3. **vanilla JS בלי build לכל דבר**, כולל דשבורד המאמנים. Supabase SDK מ-CDN.
4. **דשבורד v1**: התמדה + סטריק בלבד. מעקב משקל = שלב עתידי (דורש פיצ'ר שקילה למתאמן).
5. **פיצ'רי חשבון למתאמן כלולים**: היסטוריית ימים + סנכרון בין מכשירים (אותו מאמץ תשתיתי).
6. **תשלומים**: עוגנים בלבד (עמודת tier + גידור פיצ'רים). בלי סליקה עד ולידציה + פגישת עו"ד.
7. מה-ROADMAP (לא משתנה): המאמן מחוץ לתזונה — רואה התמדה/התקדמות, **לא פרטי תפריט**; דיסקליימר + "תפריט לדוגמה מחושב אוטומטית" + לוגו ShapEat נשארים בכל עמוד ממותג; RLS על כל טבלה מהיום הראשון; free tier עד הכנסות.

## עקרון-העל הארכיטקטוני

**localStorage נשאר מקור האמת המקומי, והקוד הקיים כמעט לא משתנה.** הענן הוא מראה משנית (offline-first). משתמש אנונימי או מנותק-רשת מקבל אפליקציה זהה בייט-לבייט להיום.

**ההפרדה בין "יום מלא" ל"סיכום התמדה" היא הפרדה טבלאית פיזית**: `day_logs` (הכל, רק המתאמן) לעומת `day_summaries` (התמדה בלבד, נגיש למאמן). דליפת פרטי תפריט למאמן בלתי אפשרית מבנית — אין policy בכלל, לא סינון עמודות שיכול להישבר.

---

## 1. מודל הנתונים (Supabase Postgres, region: Frankfurt eu-central-1)

```sql
-- ============ coaches ============
create table coaches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id),  -- NULL עד שהמאמן "תובע" את החשבון
  slug          text unique not null
                check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),  -- ASCII בלבד (סעיף 7.5)
  display_name  text not null check (char_length(display_name) between 2 and 40),
  tagline       text check (char_length(tagline) <= 80),
  brand_color   text check (brand_color ~ '^#[0-9a-fA-F]{6}$'),  -- הגנת CSS injection
  logo_path     text,                       -- נתיב ב-Storage; NULL = מונוגרמה אוטומטית
  logo_version  int not null default 1,     -- cache busting (?v=N)
  niche         text,                       -- "כוח" / "חיטוב" / "אחרי לידה" — ללוח
  status        text not null default 'pending'
                check (status in ('pending','approved','suspended')),
  tier          text not null default 'free'
                check (tier in ('free','pro','elite')),  -- עוגן תשלומים; אין אכיפה עד שלב 4
  invite_code   uuid unique default gen_random_uuid(),   -- ל-claim חד-פעמי
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index coaches_status_idx on coaches(status);

-- ============ profiles (מתאמנים; שורה = משתמש מאומת) ============
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  prefs             jsonb,          -- מראה של localStorage['dietai-state'] כפי שהוא
  prefs_updated_at  timestamptz,    -- שעון לקוח, ל-Last-Write-Wins
  created_at        timestamptz not null default now()
);

-- ============ coach_links (חיבור מתאמן-מאמן בהסכמה) ============
create table coach_links (
  id            uuid primary key default gen_random_uuid(),
  trainee_id    uuid not null references profiles(id) on delete cascade,
  coach_id      uuid not null references coaches(id) on delete cascade,
  status        text not null default 'active' check (status in ('active','revoked')),
  trainee_display_name text not null check (char_length(trainee_display_name) between 1 and 40),
                -- המתאמן קובע במסך ההסכמה; כך profiles נשאר אטום לחלוטין למאמן
  consent_text_version int not null,  -- איזה נוסח הסכמה אושר (תיקון 13)
  consent_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
-- קישור פעיל אחד בלבד למתאמן; החלפת מאמן = revoke + insert
create unique index one_active_link_per_trainee
  on coach_links(trainee_id) where status = 'active';
create index coach_links_coach_idx on coach_links(coach_id, status);

-- ============ day_logs (היום המלא — פרטי המתאמן בלבד) ============
create table day_logs (
  trainee_id        uuid not null references profiles(id) on delete cascade,
  date              date not null,           -- תאריך מקומי ישראל (ראו באג timezone, סעיף 7.1)
  payload           jsonb not null,          -- פלט serializeDay() כמו-שהוא
  client_updated_at timestamptz not null,    -- ל-LWW בסנכרון רב-מכשירי
  updated_at        timestamptz not null default now(),
  primary key (trainee_id, date),
  check (pg_column_size(payload) < 65536)    -- הגנת גודל 64KB
);

-- ============ day_summaries (מה שהמאמן רואה — התמדה בלבד) ============
create table day_summaries (
  trainee_id    uuid not null references profiles(id) on delete cascade,
  date          date not null,
  meals_planned smallint not null check (meals_planned between 1 and 10),
  meals_eaten   smallint not null check (meals_eaten between 0 and meals_planned),
  completed     boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (trainee_id, date)
  -- בכוונה אין כאן: קלוריות, יעד, שמות מאכלים, משקל. שום דבר תזונתי.
);
create index day_summaries_date_idx on day_summaries(date);

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
```

### Storage
- Bucket בשם `coach-logos`: public-read, **כתיבה רק service_role** (אלכס מעלה ידנית ב-onboarding — אין צורך במדיניות העלאה למאמנים בפיילוט).
- מגבלות: `file_size_limit = 150KB`; mime מותר: png/webp בלבד. **SVG חסום** (וקטור XSS).
- לבקש מהמאמנים לוגו 256×256 (מוצג ב-30-52px).

### נגזרת "מתאמן פעיל" (החפיר של הלוח)

```
פעיל(מתאמן, מאמן) אם ורק אם:
  coach_links.status = 'active'
  וגם auth.users.email_confirmed_at is not null          -- חשבון מאומת
  וגם count(day_summaries where meals_eaten > 0
            and date >= current_date - 13) >= X          -- X=5 להתחלה, פרמטר בטבלת config
```

ממומש כ-materialized view בשם `coach_leaderboard` (עמודות: coach_id, active_count, prev_period_count, rise_pct), מתרעננת יומית עם pg_cron. הלוח הציבורי נקרא **רק** דרך RPC בשם `get_leaderboard()` (SECURITY DEFINER) שמחזיר: display_name, niche, active_count, rise_pct — ותו לא.

anti-free-riding מובנה: רק מצבת מחוברת-בהסכמה-מאומתת נספרת; שורת summary אחת ליום (PK) חוסמת ניפוח; הכתיבה רק תחת auth.uid() של המתאמן — מאמן לא יכול לייצר פעילות.

---

## 2. מדיניות RLS (על כל טבלה מהמיגרציה הראשונה; anon key בלבד בלקוח)

| טבלה | קריאה (SELECT) | כתיבה (INSERT/UPDATE) |
|---|---|---|
| `profiles` | עצמי בלבד: `auth.uid() = id` | עצמי בלבד |
| `day_logs` | עצמי בלבד. **למאמן אין policy בכלל — חסימה מבנית** | עצמי |
| `day_summaries` | מתאמן: עצמי. מאמן: רק מתאמנים מקושרים active, **ורק שורות מ-consent_at והלאה** (ההסכמה לא פותחת עבר) | מתאמן בלבד |
| `coaches` | ציבורי דרך view בשם `coaches_public` בלבד (רק approved; רק שדות מיתוג: slug, display_name, tagline, brand_color, logo_path, logo_version, niche). מאמן: שורתו המלאה | UPDATE עצמי מוגבל-עמודות (trigger חוסם שינוי slug/status/tier). INSERT רק service_role |
| `coach_links` | מתאמן: שלו. מאמן: של המאמנות שלו | INSERT רק מתאמן (trigger מוודא שהמאמן approved). UPDATE רק מתאמן, ורק המעבר active ← revoked |
| `events` | אף אחד (קריאה רק service_role מ-Studio/שרת) | INSERT ל-anon+authenticated עם checks (whitelist + גודל) |

policy לדוגמה (הקריטית — מאמן קורא סיכומים):

```sql
create policy coach_reads_summaries on day_summaries for select using (
  auth.uid() = trainee_id
  or exists (
    select 1 from coach_links l
    join coaches c on c.id = l.coach_id
    where c.user_id = auth.uid()
      and l.trainee_id = day_summaries.trainee_id
      and l.status = 'active'
      and day_summaries.date >= l.consent_at::date
  )
);
```

### RPCs
- `claim_coach(invite uuid)` — SECURITY DEFINER: קובע `user_id = auth.uid()` רק אם `user_id is null` ומאפס את הקוד. חד-פעמי.
- `coach_roster()` — SECURITY INVOKER (RLS נאכף): מחזיר לכל מתאמן מקושר את trainee_display_name + adherence של 14 יום + streak + last_active, מחושב ב-SQL (window functions) — הלקוח לא מושך 14×N שורות.
- `get_leaderboard()` — SECURITY DEFINER: קורא מה-materialized view, מחזיר את המינימום הציבורי.
- `delete_my_account()` — SECURITY DEFINER: מוחק את auth.users של המשתמש ← cascade מוחק הכל (זכות מחיקה, תיקון 13).

### בדיקת RLS מעשית
סקריפט `supabase/tests/rls-test.mjs` עם 3 משתמשי בדיקה (מתאמן א', מתאמן ב', מאמן) שמוודא:
1. מתאמן א' לא קורא day_logs/day_summaries/profiles של ב' (0 שורות).
2. מאמן קורא day_summaries רק של מקושרים active, ולא לפני consent_at.
3. **מאמן שמנסה day_logs מקבל 0 שורות** (המבחן הקריטי).
4. אחרי revoke — הגישה נופלת מיידית.
5. anon לא קורא events ולא את טבלת coaches (רק את ה-view).

רץ לפני כל מיגרציה חדשה. בנוסף: בדיקה ידנית ב-Studio עם impersonation.

---

## 3. זרימות

### (א) מתאמן: אנונימי ← מחובר ← מקושר למאמן
1. כניסה מ-`shapeat.co.il/?coach=danny`: המיתוג מוחל ונשמר ב-`localStorage['shapeat-coach']`. **שום חובת חשבון** — בונה תפריט כרגיל.
2. אחרי קבלת ערך (השלמת יום ראשון / יום שני של שימוש): באנר רך "התחבר כדי לשמור היסטוריה ולסנכרן בין מכשירים". דחייה נשמרת (`shapeat-auth-dismissed`) ולא מציקים שבוע.
3. "התחבר למאמן דני" (מופיע רק כשיש מיתוג פעיל) ← אם לא מחובר: Google/magic link ← **מסך הסכמה** ייעודי: שם+לוגו המאמן, רשימה מפורשת ("המאמן יראה: אחוז ימים וארוחות שהשלמת, רצף ימים. המאמן לא יראה: התפריט, מאכלים, קלוריות, משקל"), שדה "השם שיוצג למאמן", checkbox, גרסת נוסח ← insert ל-coach_links.
4. **מיזוג localStorage ← ענן בהתחברות ראשונה**: dietai-state ← profiles.prefs, shapeat-day ← day_logs+day_summaries להיום (LWW: המקומי גובר אם חדש יותר). **לא מוחקים localStorage** — הוא נשאר מקור האמת המקומי.

### (ב) מאמן: onboarding ידני
טופס ההמתנה (coaches.html) ← שיחה עם אלכס ← אלכס יוצר שורת coaches (Studio/SQL) ומעלה לוגו ל-Storage ← שולח `coach-dashboard.html?invite=<invite_code>` ← המאמן מתחבר עם Google ← `claim_coach` תובע את החשבון. בשלב 0 (בלי backend): אותו תהליך מול `coaches.json` + commit.

### (ג) ביטול הסכמה
מסך "החשבון שלי" (מודאל ב-index.html) ← "נתק מהמאמן" ← update ל-revoked. אפקט מיידי דרך RLS. המיתוג יורד (מוחקים shapeat-coach). event בשם consent_revoked נרשם.

### (ד) החלפת מאמן
revoke לקישור הקיים + מסך הסכמה חדש + insert. ה-unique partial index אוכף קישור פעיל אחד. המאמן החדש רואה רק מההסכמה שלו והלאה.

### (ה) סנכרון רב-מכשירי (offline-first)
- **localStorage תמיד ראשון וסינכרוני** — הקוד הקיים לא משתנה. הענן = מראה.
- **Push (outbox debounced)**: עטיפת saveDay/saveState מסמנת דגל dirty; דחיפה אחרי 2 שניות שקט וגם ב-visibilitychange (עמוד נסגר). תמיד snapshot מלא (upsert אידמפוטנטי) — אין תור פר-שינוי, עמיד מטבעו. כשל רשת = הדגל נשאר, ניסיון חוזר בפוקוס הבא.
- **Pull**: פעם אחת בעליית עמוד (אחרי loadDay): אם client_updated_at בענן חדש מהמקומי — מחליפים ומרנדרים. LWW פר-מפתח (prefs נפרד, יום נפרד פר-תאריך). קונפליקט אמיתי רק בעריכת אותו יום בשני מכשירים בו-זמנית — המאוחר גובר (מקובל למוצר; מתועד).
- אנונימי = שכבת הסנכרון לא רצה (`if (!session) return`). Supabase נפל = catch שקט, האפליקציה זהה להיום.

---

## 4. אינטגרציה בקוד הקיים (בלי לשבור)

סדר טעינה חדש ב-index.html:

```html
<script src="coach-theme.js"></script>   <!-- חדש, זעיר, לפני הכל: מיתוג בלי הבהוב -->
<script src="data.js"></script>
<script src="app.js"></script>
<script src="ui.js"></script>
<script defer
  src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.x.y/dist/umd/supabase.min.js"
  integrity="sha384-..." crossorigin="anonymous"></script>
<script defer src="supabase-client.js"></script>  <!-- חדש: עוטף פונקציות קיימות -->
```

**SRI חובה על ה-CDN**: נועלים גרסה מדויקת (לא `@2` צף — SRI בלתי אפשרי עם tag צף) ומוסיפים `integrity` + `crossorigin="anonymous"`. אפליקציה שמחזיקה נתוני בריאות לא טוענת קוד צד-שלישי בלי אימות hash (הגנה מפני CDN שנפרץ). עדכון גרסה = עדכון hash מודע, לא שקט. אותו עיקרון חל על gsap ב-index.html אם יתווסף אי-פעם.

- **coach-theme.js** (~80 שורות, שלב 0): קורא `?coach=` ← מנרמל (lowercase + regex) ← שומר ב-localStorage ← טוען מיתוג (שלב 0: coaches.json בריפו; שלב 2: coaches_public עם coaches.json כ-fallback) ← מחיל: setProperty על --accent/--accent-2, החלפת לוגו (src מה-Storage עם ?v=version) או ציור מונוגרמה (עיגול עם אות ראשונה, כמו בדמו), שם/סלוגן **דרך textContent בלבד** (לא innerHTML), והוספת שורת "מופעל ע"י ShapEat · תפריט לדוגמה מחושב אוטומטית" קבועה מתחת ללוגו (מיגון משפטי, לא ניתנת להסרה). כל כשל (slug לא קיים / fetch נפל) ← ברירת מחדל ShapEat + מחיקת המפתח.
- **עטיפה בלי שכתוב**: הסקריפטים אינם מודולים, לכן הפונקציות הקיימות הן bindings על window. ב-supabase-client.js:

```js
const _saveDay = window.saveDay;
window.saveDay = function () { _saveDay(); Sync.markDirty('day'); };
```

  כל הקריאות הקיימות בתוך ui.js עוברות דרך ה-binding הגלובלי — אפס נגיעה בקוד קיים. מהעטיפה נגזרים: day_logs (serializeDay(DAY)) + day_summaries (meals_planned מהארוחות הלא-מוסרות שאינן treat; meals_eaten מ-DAY.eaten; completed מ-dayComplete()).
- **coach-dashboard.html**: עמוד עצמאי שממחזר 1:1 את העיצוב ופונקציות הרינדור של coach-demo.html (ה-sparkline של המשקל יחכה לשלב מעקב-המשקל; ב-v1 מציגים התמדה+סטריק בלבד). נתונים מ-coach_roster() ו-get_leaderboard(). **כל שדה מה-DB עובר esc()** (מעתיקים מ-ui.js:11-13).
- **האפליקציה בלי רשת/חשבון**: כל מגע חדש עטוף try/catch + בדיקת קיום, כמו הדפוס הקיים של localStorage ב-ui.js.

---

## 5. שלבים וקריטריוני יציאה

### שלב 0 — white-label סטטי (בלי backend, ~שבוע)
**נבנה**: `coaches.json` בריפו (`[{slug, name, tagline, color, color2, logo}]`) + לוגואים ב-`brand/coaches/`; `coach-theme.js`; 2 שורות ב-index.html; **תיקון באג ה-timezone (סעיף 7.1) — עכשיו, לפני שיש דאטה בענן**.
**ניהול**: הוספת מאמן = עריכת coaches.json + commit (דקה עבודה).
**יציאה**: מאמן פיילוט אחד עם לינק חי; רענון שומר מיתוג; slug שגוי = ברירת מחדל נקייה; בדיקת ניגודיות לצבע המאמן.

### שלב 1 — Supabase Core (חשבון, היסטוריה, סנכרון)
**נבנה**: פרויקט Supabase (Frankfurt); `supabase/migrations/001_core.sql` (profiles, day_logs, events + RLS); Auth Google+magic-link; `supabase-client.js` (מודאל התחברות, עטיפות, push/pull, מיזוג ראשוני); מסך "היסטוריה" (רשימת ימים מ-day_logs, ממחזר deserializeDay/renderDay במצב קריאה); events מהלקוח; `.github/workflows/supabase-keepalive.yml` (פינג שבועי — free tier נכנס להשהיה אחרי שבוע ללא פעילות); `supabase/tests/rls-test.mjs`; עדכון privacy.html (מה נשמר בענן).
**יציאה**: שני מכשירים מסונכרנים; **מצב אנונימי ומצב offline זהים להיום בייט-לבייט**; מבחן RLS ירוק; keepalive רץ.

### שלב 2 — חיבור מתאמן-מאמן + דשבורד v1
**נבנה**: `002_coaches.sql` (coaches, coach_links, day_summaries, view, RPCs + RLS); מסך הסכמה (מודאל ב-index.html); כתיבת day_summaries בעטיפת saveDay; `coach-dashboard.html`; מעבר coach-theme.js ל-coaches_public (עם fallback); ניתוק/החלפה במסך החשבון; `docs/coach-onboarding.md` (מדריך Studio צעד-צעד לאלכס).
**יציאה**: מאמן פיילוט רואה התמדה אמיתית של 3+ מתאמנים בהסכמה; מבחן "מאמן מנסה day_logs ← 0 שורות"; revoke מנתק מיידית (נבדק); מתאמן בלי הסכמה לא מופיע.

### שלב 3 — לוח מאמנים
**נבנה**: `003_leaderboard.sql` (טבלת config עם X, materialized view, pg_cron refresh, get_leaderboard); טאב הלוח בדשבורד + עמוד ציבורי `board.html` (SEO — החפיר השיווקי); event בשם coach_link_visited.
**יציאה**: רק פעילים-לפי-ההגדרה נספרים; ניסיון ניפוח (סימון 20 ארוחות ביום) לא מזיז את המספר; מציגים Top N + "עולים" בלבד (לא מביכים מאמנים עם 0).

### שלב 4 — עוגני מונטיזציה
**נבנה**: אכיפת tier בדשבורד (free = עד 5 מתאמנים מקושרים — trigger שסופר ב-coach_links); badge בלוח; עמוד תמחור סטטי. בלי סליקה.
**יציאה**: הגידור עובד (קישור שישי נחסם עם הודעה); נקודת החיבור לסליקה עתידית = עדכון tier ידני ע"י אלכס.

## ניהול (Admin) — "Studio עד שזה כואב"
- **אין עמוד אדמין בהתחלה, במכוון**: שלב 0 = coaches.json; שלבים 1-2 = Supabase Studio (עריכת טבלאות בדפדפן) + `docs/coach-onboarding.md`; שאילתות SQL שמורות ל-KPI.
- אדמין מינימלי משלנו (אישור/השעיה + רשימה) נבנה רק כשזה מציק (~10+ מאמנים).
- **חוויית המשתמש הרגיל לא משתנה בכלום**: מיתוג רק מלינק `?coach=`; כניסה רגילה זהה להיום; באנר ההתחברות רך ונסגר.

---

## 6. אמינות / אבטחה / סקייל

- **Supabase לא זמין**: degrade מלא לאנונימי-מקומי (try/catch בכל מגע). באנר עדין "הסנכרון יתחדש אוטומטית" רק אם יש session. הדשבורד (שאין לו fallback) מציג שגיאה מפורשת.
- **Rate limiting**: Auth מובנה ב-Supabase; events עם throttle בלקוח + checks בגודל; upserts של יום חסומים מבנית ל-1/יום (PK). בעתיד: Cloudflare מול ה-API.
- **ולידציה ב-DB**: כל ה-checks במודל + triggers: מעברי סטטוס ב-coach_links, חסימת slug/tier למאמן, תאריך לא-עתידי (סובלנות יום, timezone), meals_eaten <= meals_planned.
- **גיבוי**: free tier בלי PITR ← GitHub Action שבועי `supabase db dump` (service key רק ב-GitHub secrets — לעולם לא בריפו; artifact פרטי). coaches.json והלוגואים ממילא בגיט.
- **ניטור מכסה**: אותו Action מדווח גודל DB + ספירת MAU (לקראת תקרות ה-free tier: 50K MAU / 500MB).
- **מפתחות**: anon key בלבד בקוד הלקוח (צפוי וחוקי — RLS הוא ההגנה). service_role רק ב-secrets.

## 7. פינות שאסור לפספס

1. **באג timezone קיים — לתקן בשלב 0**: `todayStr()` (ui.js:73) משתמש ב-toISOString() שהוא UTC. בישראל (UTC+2/3), בין חצות ל-02:00/03:00 התאריך המוחזר הוא אתמול — סימון "אכלתי" ב-00:30 נרשם ליום הקודם, וה-rollover קורה ב-02:00 במקום בחצות. תיקון: `new Date().toLocaleDateString('en-CA')` (מחזיר YYYY-MM-DD מקומי). **חובה לפני day_summaries** — אחרת ההתמדה בדשבורד תזלוג בין ימים. ה-DB שומר את תאריך הלקוח (לא נגזר בשרת), עם trigger סובלנות של יום.
2. **esc/textContent על כל שדה מאמן** (שם/סלוגן/niche) בכל הזרקה ל-DOM. brand_color מוגן ב-check regex (צבע חופשי = וקטור CSS injection).
3. **לוגו**: 150KB מקס, png/webp, בלי SVG; `?v=logo_version` נגד cache אגרסיבי של ה-CDN.
4. **cache busting לקבצי JS**: GitHub Pages מקשש; אחרי הוספת הסקריפטים החדשים לאמץ `?v=N` על תגי script.
5. **slug באנגלית בלבד** (constraint אוכף): URL עברי נשבר בהעתקות וואטסאפ/אינסטגרם. display_name בעברית מלאה.
6. **תיקון 13 (פרטיות)**: מזעור — למאמן זולג רק התמדה; הסכמה מגורסאות (consent_text_version); זכות מחיקה — delete_my_account() עם cascade; עדכון privacy.html בשלב 1 (מה בענן, Supabase כמעבד-משנה). נוסח ההסכמה — לפגישת עו"ד שכבר מתוכננת לפני גבייה.
7. **נגישות**: focus-trap במודאלים החדשים (כמו מודאל הדיסקליימר הקיים); צבע מאמן דינמי — חישוב luminance ואם ניגודיות טקסט-לבן < 4.5:1 מכהים או נופלים לברירת מחדל; roles/aria לטאבים בדשבורד.
8. **PWA עתידי**: manifest עם theme סטטי של ShapEat; לא לקבע הנחות על query param — המיתוג כבר persist ב-localStorage משלב 0.
9. **חריגים קשיחים בתמה** (לא חוסם, לשלמות): צבעי הקונפטי (ui.js) וה-logo-eat הירוק אינם ממותגים; אפשר להסב ל-var(--accent) בהמשך.

## קבצים חדשים לפי שלב

| שלב | קבצים |
|---|---|
| 0 | `coach-theme.js`, `coaches.json`, `brand/coaches/` (לוגואים), עריכת index.html (+תיקון ui.js:73) |
| 1 | `supabase-client.js`, `supabase/migrations/001_core.sql`, `supabase/tests/rls-test.mjs`, `.github/workflows/supabase-keepalive.yml`, עריכת privacy.html |
| 2 | `supabase/migrations/002_coaches.sql`, `coach-dashboard.html`, `docs/coach-onboarding.md` |
| 3 | `supabase/migrations/003_leaderboard.sql`, `board.html` |
| 4 | עריכות בדשבורד + עמוד תמחור |
