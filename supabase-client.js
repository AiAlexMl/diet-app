/* ══════════════════════════════════════════
   supabase-client.js — שלב 1: חשבון, היסטוריה, סנכרון (offline-first)
   נטען defer אחרי ui.js. עוטף פונקציות קיימות דרך window — אפס נגיעה בקוד קיים.
   עקרון-העל: localStorage תמיד ראשון וסינכרוני; הענן מראה משנית.
   אנונימי / בלי קונפיג / Supabase נפל ⇒ האפליקציה זהה להיום בייט-לבייט.
   מקור: internal/ARCHITECTURE-COACHES.md (המסמך המחייב).
   ══════════════════════════════════════════ */
(function () {
  'use strict';

  // ── קונפיג: ה-anon key ציבורי במתכוון (RLS הוא ההגנה). ריק ⇒ השכבה לא רצה ──
  const SUPA_URL  = 'https://kjlxgamalfzdjtjxfzun.supabase.co';
  const SUPA_ANON = 'sb_publishable_cUbB5SU30DWzSdFmP2T24w_lc4PjF9f';

  if (!SUPA_URL || !SUPA_ANON || !window.supabase) return;

  const sb = window.supabase.createClient(SUPA_URL, SUPA_ANON);

  const STATE_KEY = 'dietai-state';
  const DAY_KEY   = 'shapeat-day';
  const META_KEY  = 'shapeat-sync-meta';      // { prefs: iso, day: iso } — שעון לקוח ל-LWW

  const nowIso = () => new Date().toISOString();
  const newer  = (a, b) => Date.parse(a) > Date.parse(b);   // השוואת זמנים בטוחה (פורמטים שונים)
  const parse  = s => { try { return JSON.parse(s); } catch (e) { return null; } };
  const lsGet  = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet  = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  let session = null;
  const meta  = parse(lsGet(META_KEY)) || {};
  const dirty = { prefs: false, day: false };
  let pushTimer = null;

  const saveMeta = () => lsSet(META_KEY, JSON.stringify(meta));

  // ══════════ אנליטיקס פנימי (events, אנונימי, insert-only) ══════════
  let evtCount = 0;                            // throttle בלקוח
  function anonId() {
    let id = lsGet('shapeat-anon');
    if (!id) { id = crypto.randomUUID(); lsSet('shapeat-anon', id); }
    return id;
  }
  function track(type, props) {
    if (evtCount++ > 30) return;               // תקרת אירועים לסשן
    try {
      sb.from('events').insert({
        event_type: type, anon_id: anonId(),
        coach_slug: lsGet('shapeat-coach') || null,
        props: props || null,
      }).then(() => {}, () => {});
    } catch (e) {}
  }

  // ══════════ Push: outbox debounced — snapshot מלא, upsert אידמפוטנטי ══════════
  function markDirty(kind) {
    meta[kind] = nowIso(); saveMeta();
    dirty[kind] = true;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 2000);        // דחיפה אחרי 2 שניות שקט
  }

  async function push() {
    if (!session) return;
    const uid = session.user.id;
    try {
      if (dirty.prefs || dirty.day) {          // שורת profiles חייבת להתקיים לפני day_logs (FK)
        const rec = { id: uid };
        const state = parse(lsGet(STATE_KEY));
        if (dirty.prefs && state) { rec.prefs = state; rec.prefs_updated_at = meta.prefs || nowIso(); }
        const { error } = await sb.from('profiles').upsert(rec);
        if (error) return;                     // כשל רשת — הדגלים נשארים, ניסיון חוזר בפוקוס
        dirty.prefs = false;
      }
      if (dirty.day) {
        const payload = parse(lsGet(DAY_KEY));
        if (payload && payload.date) {
          const { error } = await sb.from('day_logs').upsert({
            trainee_id: uid, date: payload.date,
            payload, client_updated_at: meta.day || nowIso(),
          });
          if (error) return;
        }
        dirty.day = false;
      }
    } catch (e) { /* offline — הדגלים נשארים */ }
  }

  // עמוד נסגר/מוסתר — מנסים לדחוף מיד; כשל = ניסיון חוזר בפוקוס הבא
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { clearTimeout(pushTimer); push(); }
  });
  window.addEventListener('focus', () => { if (dirty.prefs || dirty.day) push(); });

  // ══════════ Pull: פעם אחת בעלייה — LWW פר-מפתח, המקומי גובר אם חדש יותר ══════════
  async function pull() {
    if (!session) return;
    const uid = session.user.id;
    try {
      const { data: prof } = await sb.from('profiles')
        .select('prefs,prefs_updated_at').eq('id', uid).maybeSingle();
      if (prof && prof.prefs && prof.prefs_updated_at &&
          (!meta.prefs || newer(prof.prefs_updated_at, meta.prefs))) {
        lsSet(STATE_KEY, JSON.stringify(prof.prefs));
        meta.prefs = prof.prefs_updated_at; saveMeta();
        try { loadState(); applyGender(); updateMacroDisplay(); } catch (e) {}
      }
      const { data: row } = await sb.from('day_logs')
        .select('payload,client_updated_at')
        .eq('trainee_id', uid).eq('date', todayStr()).maybeSingle();
      if (row && row.payload &&
          (!meta.day || newer(row.client_updated_at, meta.day))) {
        lsSet(DAY_KEY, JSON.stringify(row.payload));
        meta.day = row.client_updated_at; saveMeta();
        try { DAY = loadDay(); if (DAY) renderDay(); } catch (e) {}   // אותו מסלול כמו בעליית עמוד
      }
    } catch (e) { /* offline — בלי סנכרון הפעם */ }
  }

  // ══════════ עטיפות (הדפוס מהארכיטקטורה — binding על window) ══════════
  const _saveState = window.saveState;
  window.saveState = function () { _saveState.apply(this, arguments); markDirty('prefs'); };

  const _saveDay = window.saveDay;
  window.saveDay = function () { _saveDay.apply(this, arguments); markDirty('day'); };

  const _renderMenu = window.renderMenu;
  window.renderMenu = function () {
    _renderMenu.apply(this, arguments);
    track('menu_built');
  };

  const _toggleEaten = window.toggleEaten;
  window.toggleEaten = function () {
    _toggleEaten.apply(this, arguments);
    try {
      if (dayComplete() && lsGet('shapeat-evt-day') !== todayStr()) {
        lsSet('shapeat-evt-day', todayStr());
        track('day_completed');
        maybeShowBanner();                     // רגע קבלת-הערך — הצעה רכה להתחבר
      }
    } catch (e) {}
  };

  // ══════════ באנר רך — רק אחרי קבלת ערך, דחייה = שקט לשבוע ══════════
  let bannerEl = null;
  function maybeShowBanner() {
    if (session || bannerEl) return;
    const dismissed = +(lsGet('shapeat-auth-dismissed') || 0);
    if (Date.now() - dismissed < 7 * 864e5) return;
    const first = lsGet('shapeat-first-seen');
    if (!first) { lsSet('shapeat-first-seen', todayStr()); return; }   // יום ראשון — עוד לא מציעים
    let earned = first !== todayStr();                                  // יום שני של שימוש
    try { earned = earned || dayComplete(); } catch (e) {}              // או השלמת יום
    if (!earned) return;

    bannerEl = document.createElement('div');
    bannerEl.className = 'sync-banner';
    const txt = document.createElement('span');
    txt.textContent = 'רוצה לשמור היסטוריה ולסנכרן בין מכשירים?';
    const login = document.createElement('button');
    login.className = 'sync-banner-btn';
    login.textContent = 'התחברות';
    login.onclick = () => { hideBanner(); openLogin(); };
    const later = document.createElement('button');
    later.className = 'sync-banner-later';
    later.textContent = 'לא עכשיו';
    later.onclick = () => { lsSet('shapeat-auth-dismissed', String(Date.now())); hideBanner(); };
    bannerEl.append(txt, login, later);
    document.body.appendChild(bannerEl);
  }
  function hideBanner() { if (bannerEl) { bannerEl.remove(); bannerEl = null; } }

  // ══════════ מודאל התחברות: Google + magic link ══════════
  let authEl = null;
  function openLogin() {
    if (authEl) return;
    authEl = document.createElement('div');
    authEl.className = 'auth-overlay';
    authEl.addEventListener('click', e => { if (e.target === authEl) closeLogin(); });

    const box = document.createElement('div');
    box.className = 'auth-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'התחברות');

    const h = document.createElement('h3');
    h.textContent = 'שמירת היסטוריה וסנכרון';
    const p = document.createElement('p');
    p.className = 'auth-sub';
    p.textContent = 'ההעדפות והימים שלך יישמרו לחשבון ויהיו זמינים מכל מכשיר.';

    // הסכמה אקטיבית (כמו הדיסקליימר): הכפתורים נעולים עד סימון
    const consent = document.createElement('label');
    consent.className = 'auth-consent';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    const ctxt = document.createElement('span');
    ctxt.appendChild(document.createTextNode('אני מאשר/ת את '));
    const pl = document.createElement('a');
    pl.href = 'privacy.html';
    pl.target = '_blank';
    pl.rel = 'noopener';
    pl.textContent = 'מדיניות הפרטיות';
    ctxt.appendChild(pl);
    ctxt.appendChild(document.createTextNode(' ואת שמירת ההעדפות והתפריטים שלי בענן, לחשבוני בלבד.'));
    consent.append(cb, ctxt);
    cb.addEventListener('change', () => { gBtn.disabled = mBtn.disabled = !cb.checked; });

    const gBtn = document.createElement('button');
    gBtn.className = 'auth-google';
    gBtn.textContent = 'המשך עם Google';
    gBtn.disabled = true;
    gBtn.onclick = () => {
      sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname },
      }).catch(() => setStatus('החיבור נכשל, נסה שוב'));
    };

    const div = document.createElement('div');
    div.className = 'auth-divider';
    div.textContent = 'או';

    const email = document.createElement('input');
    email.type = 'email';
    email.className = 'auth-email';
    email.placeholder = 'כתובת אימייל';
    email.setAttribute('aria-label', 'כתובת אימייל');
    const mBtn = document.createElement('button');
    mBtn.className = 'auth-magic';
    mBtn.textContent = 'שלחו לי קישור התחברות';
    mBtn.disabled = true;
    mBtn.onclick = async () => {
      const v = (email.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setStatus('כתובת אימייל לא תקינה'); return; }
      mBtn.disabled = true;
      try {
        const { error } = await sb.auth.signInWithOtp({
          email: v, options: { emailRedirectTo: location.origin + location.pathname },
        });
        setStatus(!error ? 'שלחנו קישור למייל. פתח אותו במכשיר שבו תרצה להתחבר'
          : error.status === 429 ? 'נשלחו יותר מדי מיילים. נסה שוב בעוד כשעה'
          : 'השליחה נכשלה, נסה שוב');
      } catch (e) { setStatus('השליחה נכשלה, נסה שוב'); }
      mBtn.disabled = !cb.checked;
    };

    const status = document.createElement('p');
    status.className = 'auth-status';
    status.setAttribute('aria-live', 'polite');
    function setStatus(t) { status.textContent = t; }

    const x = document.createElement('button');
    x.className = 'auth-close';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'סגירה');
    x.onclick = closeLogin;

    box.append(x, h, p, consent, gBtn, div, email, mBtn, status);
    authEl.appendChild(box);
    document.body.appendChild(authEl);

    // focus-trap בסיסי (כמו מודאל הדיסקליימר): Esc סוגר, Tab נשאר בתוך המודאל
    cb.focus();
    authEl.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeLogin();
      if (e.key === 'Tab') {
        const items = [...box.querySelectorAll('button,input')].filter(el => !el.disabled);
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
  function closeLogin() { if (authEl) { authEl.remove(); authEl = null; } }

  // ══════════ מיזוג ראשוני בהתחברות: pull (ענן חדש גובר) ← push (מקומי קיים עולה) ══════════
  async function firstMerge() {
    await pull();
    if (!meta.prefs) { meta.prefs = nowIso(); }
    if (!meta.day)   { meta.day   = nowIso(); }
    saveMeta();
    dirty.prefs = true;
    dirty.day   = !!parse(lsGet(DAY_KEY));
    push();
  }

  // ══════════ init ══════════
  sb.auth.onAuthStateChange((evt, sess) => {
    session = sess;
    if (evt === 'SIGNED_IN') {
      closeLogin(); hideBanner();
      if (!lsGet('shapeat-signup-sent')) { lsSet('shapeat-signup-sent', '1'); track('signup'); }
      firstMerge();
    }
    if (evt === 'INITIAL_SESSION' && sess) pull();
  });

  // חשיפה מינימלית למסך "החשבון שלי" (ייבנה עם מסך ההיסטוריה)
  window.shapeatAccount = {
    login:  openLogin,
    logout: () => sb.auth.signOut(),
    deleteAccount: async () => { await sb.rpc('delete_my_account'); await sb.auth.signOut(); },
    isConnected: () => !!session,
  };

  // יום ראשון של שימוש נרשם; הבאנר יופיע רק מהיום השני / השלמת יום
  if (!lsGet('shapeat-first-seen')) lsSet('shapeat-first-seen', todayStr());
  setTimeout(maybeShowBanner, 1500);
})();
