/* ══════════════════════════════════════════
   rls-test.mjs — בדיקת RLS מעשית (שלב 1: profiles / day_logs / events)
   רץ לפני כל מיגרציה חדשה. שלב 2 יוסיף: מאמן מול day_summaries + revoke.

   הרצה (המפתחות לא נשמרים בשום קובץ — משתני סביבה בלבד):
     SUPABASE_URL=https://xxx.supabase.co \
     SUPABASE_ANON_KEY=eyJ... \
     SUPABASE_SERVICE_KEY=eyJ... \
     node supabase/tests/rls-test.mjs
   ══════════════════════════════════════════ */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error('חסרים משתני סביבה: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

// ── משתמשי בדיקה חד-פעמיים (נמחקים בסוף) ──
const PASS = 'rls-test-' + crypto.randomUUID();
async function makeUser(tag) {
  const email = `rls-test-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASS, email_confirm: true,
  });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PASS });
  if (e2) throw new Error(`signIn ${tag}: ${e2.message}`);
  return { id: data.user.id, client };
}

const today = new Date().toLocaleDateString('en-CA');
let a, b;

try {
  a = await makeUser('a');
  b = await makeUser('b');

  // ── הכנה: לכל מתאמן פרופיל ויום ──
  for (const u of [a, b]) {
    const { error: pe } = await u.client.from('profiles')
      .upsert({ id: u.id, prefs: { goal: 'maintain' }, prefs_updated_at: new Date().toISOString() });
    check(`מתאמן כותב profile לעצמו (${u === a ? 'א' : 'ב'})`, !pe, pe?.message);
    const { error: de } = await u.client.from('day_logs').upsert({
      trainee_id: u.id, date: today,
      payload: { date: today, meals: [] }, client_updated_at: new Date().toISOString(),
    });
    check(`מתאמן כותב day_log לעצמו (${u === a ? 'א' : 'ב'})`, !de, de?.message);
  }

  // ── 1. בידוד בין מתאמנים: א' לא רואה כלום של ב' ──
  const { data: p } = await a.client.from('profiles').select('*').eq('id', b.id);
  check("מתאמן א' לא קורא profile של ב' (0 שורות)", (p || []).length === 0);
  const { data: d } = await a.client.from('day_logs').select('*').eq('trainee_id', b.id);
  check("מתאמן א' לא קורא day_logs של ב' (0 שורות)", (d || []).length === 0);

  // ── 2. א' לא כותב בשם ב' ──
  const { error: w1 } = await a.client.from('day_logs').upsert({
    trainee_id: b.id, date: today,
    payload: { date: today, meals: [] }, client_updated_at: new Date().toISOString(),
  });
  check("מתאמן א' לא כותב day_log בשם ב'", !!w1);
  const { error: w2 } = await a.client.from('profiles')
    .update({ prefs: { hacked: true } }).eq('id', b.id);
  // update על שורה לא-נגישה = 0 שורות מושפעות (RLS מסנן) — נוודא שלא השתנה בפועל
  const { data: bp } = await b.client.from('profiles').select('prefs').eq('id', b.id).single();
  check("prefs של ב' לא השתנה מניסיון עדכון של א'", !bp.prefs.hacked, w2?.message);

  // ── 3. events: כתיבה פתוחה, קריאה חסומה ──
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: ee } = await anon.from('events').insert({
    event_type: 'menu_built', anon_id: crypto.randomUUID(),
  });
  check('anon כותב event (insert-only)', !ee, ee?.message);
  const { data: ev } = await anon.from('events').select('*').limit(1);
  check('anon לא קורא events (0 שורות)', (ev || []).length === 0);
  const { error: badType } = await anon.from('events').insert({
    event_type: 'not-in-whitelist', anon_id: crypto.randomUUID(),
  });
  check('event מחוץ ל-whitelist נדחה', !!badType);

  // ── 4. תאריך עתידי נדחה (trigger, סובלנות יום) ──
  const far = new Date(Date.now() + 5 * 864e5).toLocaleDateString('en-CA');
  const { error: fe } = await a.client.from('day_logs').upsert({
    trainee_id: a.id, date: far,
    payload: { date: far, meals: [] }, client_updated_at: new Date().toISOString(),
  });
  check('day_log עם תאריך עתידי (+5 ימים) נדחה', !!fe);

  // ── 5. delete_my_account: מוחק את המשתמש וכל הדאטה ──
  const { error: da } = await b.client.rpc('delete_my_account');
  check('delete_my_account רץ למשתמש מחובר', !da, da?.message);
  const { data: gone } = await admin.from('profiles').select('id').eq('id', b.id);
  check('ה-cascade מחק את ה-profile', (gone || []).length === 0);
  b = null;   // כבר נמחק
} catch (e) {
  console.error('✗ שגיאה קשה:', e.message);
  failures++;
} finally {
  // ── ניקוי ──
  for (const u of [a, b].filter(Boolean)) {
    try { await admin.auth.admin.deleteUser(u.id); } catch (e) {}
  }
}

console.log(failures === 0 ? '\nכל בדיקות ה-RLS עברו ✓' : `\n${failures} בדיקות נכשלו ✗`);
process.exit(failures === 0 ? 0 : 1);
