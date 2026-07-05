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
  const FAV_KEY   = 'shapeat-favorites';      // מקור התצוגה תמיד מקומי; הענן מתמזג פנימה

  const nowIso = () => new Date().toISOString();
  const newer  = (a, b) => Date.parse(a) > Date.parse(b);   // השוואת זמנים בטוחה (פורמטים שונים)
  const parse  = s => { try { return JSON.parse(s); } catch (e) { return null; } };
  const lsGet  = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet  = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  let session = null;
  // אנונימי לחץ "שמור" → נשמור מיד אחרי התחברות. חייב לשרוד redirect (Google/magic-link)
  // ולכן ב-localStorage, עם חלון זמן שמונע שמירת יום אחר אם ההתחברות קורית הרבה אחר כך.
  const FAV_INTENT_KEY = 'shapeat-fav-intent';
  const FAV_INTENT_MS  = 30 * 60 * 1000;
  const meta  = parse(lsGet(META_KEY)) || {};
  const dirty = { prefs: false, day: false, favs: false };
  let pushTimer = null;
  // outbox למועדפים: אילו fav_id ממתינים לעלייה/מחיקה. caveat מתועד: מחיקה offline
  // שלא הגיעה לשרת (הטאב נסגר לפני retry) תקום לתחייה מהענן ב-pull הבא — מקובל ל-v1.
  const pendingFavUpserts = new Set();
  const pendingFavDeletes = new Set();

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
      if (dirty.prefs || dirty.day || dirty.favs) {   // שורת profiles חייבת להתקיים לפני day_logs/favorites (FK)
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
      if (dirty.favs) {
        if (pendingFavUpserts.size) {
          const local = parse(lsGet(FAV_KEY)) || [];
          const rows = local.filter(f => pendingFavUpserts.has(f.fav_id)).map(f => ({
            trainee_id: uid, fav_id: f.fav_id, date: f.date,
            saved_at: f.saved_at, payload: f.payload,
          }));
          if (rows.length) {
            const { error } = await sb.from('favorites').upsert(rows);
            if (error) return;
          }
          pendingFavUpserts.clear();           // גם fav שנדחק מה-cap המקומי לא יעלה שוב
        }
        if (pendingFavDeletes.size) {
          const { error } = await sb.from('favorites')
            .delete().eq('trainee_id', uid).in('fav_id', [...pendingFavDeletes]);
          if (error) return;
          pendingFavDeletes.clear();
        }
        dirty.favs = false;
      }
    } catch (e) { /* offline — הדגלים נשארים */ }
  }

  // עמוד נסגר/מוסתר — מנסים לדחוף מיד; כשל = ניסיון חוזר בפוקוס הבא
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { clearTimeout(pushTimer); push(); }
  });
  window.addEventListener('focus', () => { if (dirty.prefs || dirty.day || dirty.favs) push(); });

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
      // מועדפים: איחוד לפי fav_id — saved_at מאוחר גובר; לא מחיים מחיקה שממתינה לעלייה
      const { data: cloudFavs } = await sb.from('favorites')
        .select('fav_id,date,saved_at,payload')
        .eq('trainee_id', uid).order('saved_at', { ascending: false }).limit(30);
      if (Array.isArray(cloudFavs)) {
        const byId = {};
        (parse(lsGet(FAV_KEY)) || []).forEach(f => { byId[f.fav_id] = f; });
        cloudFavs.forEach(f => {
          if (pendingFavDeletes.has(f.fav_id)) return;
          if (!byId[f.fav_id] || newer(f.saved_at, byId[f.fav_id].saved_at)) byId[f.fav_id] = f;
        });
        const merged = Object.values(byId)
          .sort((a, b) => (a.saved_at < b.saved_at ? 1 : -1)).slice(0, 30);
        lsSet(FAV_KEY, JSON.stringify(merged));
        try { updateFavHeart(); } catch (e) {}
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

  const _saveFavorite = window.saveFavorite;
  window.saveFavorite = function () {
    // מועדפים = פיצ'ר חשבון. אנונימי אינו שומר "לשומקום" (אין לו מסך לראות אותו);
    // במקום זה נדנוד התחברות מפורש, וכוונת השמירה תמומש מיד עם ההתחברות.
    if (!session) {
      lsSet(FAV_INTENT_KEY, String(Date.now()));
      openLogin('כדי לשמור תפריטים ולראות אותם שוב בהיסטוריה צריך חשבון. ההתחברות תשמור מיד את התפריט הזה.');
      return null;
    }
    const res = _saveFavorite.apply(this, arguments);
    if (res && res.fav) {
      if (res.created) track('menu_saved');    // רק יצירה, לא עדכון snapshot
      pendingFavUpserts.add(res.fav.fav_id);
      markDirty('favs');
      // חוט מפורש מהלב אל החלון שרואים בו את התפריטים: פעולה שפותחת ישר את לשונית "שמורים"
      showToastSafe(res.created ? 'נשמר במועדפים ✓' : 'עודכן במועדפים ✓', 5000,
        { label: 'צפייה', onClick: () => openAccountModal('favs') });
    }
    return res;
  };

  const _removeFavorite = window.removeFavorite;
  window.removeFavorite = function (favId) {
    const res = _removeFavorite.apply(this, arguments);
    if (session) {
      pendingFavUpserts.delete(favId);
      pendingFavDeletes.add(favId);
      markDirty('favs');
    }
    return res;
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
  function openLogin(subtitle) {
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
    p.textContent = subtitle || 'ההעדפות והימים שלך יישמרו לחשבון ויהיו זמינים מכל מכשיר.';

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
    gBtn.type = 'button';
    // הלוגו הרשמי של Google (4 צבעים) + טקסט — נכס סטטי מהימן, ללא קלט משתמש
    gBtn.innerHTML =
      '<svg class="g-icon" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">' +
      '<path fill="#4285F4" d="M17.64 9.2045c0-.6382-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"/>' +
      '<path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1809l-2.9087-2.2581c-.8064.54-1.8368.8595-3.0477.8595-2.344 0-4.3282-1.5832-5.0364-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"/>' +
      '<path fill="#FBBC05" d="M3.9636 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.9636 10.71z"/>' +
      '<path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9636 7.29C4.6718 5.1668 6.6559 3.5795 9 3.5795z"/>' +
      '</svg>' +
      '<span>המשך עם Google</span>';
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
    // כל המועדפים המקומיים (כולל מה שהתמזג עכשיו) עולים — upsert אידמפוטנטי
    const favs = parse(lsGet(FAV_KEY)) || [];
    if (favs.length) {
      favs.forEach(f => pendingFavUpserts.add(f.fav_id));
      dirty.favs = true;
    }
    push();
  }

  // ══════════ מודאל "החשבון שלי" — היסטוריה (ימים מהענן) + מועדפים + ניהול חשבון ══════════
  // pull() שרץ ברקע בזמן שהמודאל פתוח לא מפריע — המודאל יושב על body, לא בתוך #menu-output.
  let accountEl = null;

  // סטטיסטיקות שורה מ-payload של serializeDay (eaten צמוד לאינדקסים של meals המלא)
  function dayStats(payload) {
    let planned = 0, eaten = 0, cal = 0;
    (payload.meals || []).forEach((m, i) => {
      if (m.removed) return;
      planned++;
      cal += m.totCal || 0;
      if (payload.eaten && payload.eaten[i]) eaten++;
    });
    return { planned, eaten, cal: Math.round(cal) };
  }

  function dateLabel(dateStr) {
    try {
      return new Date(dateStr + 'T12:00:00')
        .toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
    } catch (e) { return dateStr; }
  }

  // שעת השמירה — המבדיל בין כמה מועדפים באותו יום (מטרה+קלוריות זהות ב"תפריט נוסף")
  function timeLabel(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d)) return '';
      return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function openAccountModal(initialTab) {
    if (accountEl || !session) return;
    accountEl = document.createElement('div');
    accountEl.className = 'auth-overlay account-overlay';   // account-overlay → מסך-מלא במובייל (scoped, לא נוגע במודאל ההתחברות)
    accountEl.addEventListener('click', e => { if (e.target === accountEl) closeAccountModal(); });

    const box = document.createElement('div');
    box.className = 'auth-box account-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'החשבון שלי');

    const x = document.createElement('button');
    x.className = 'auth-close';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'סגירה');
    x.onclick = closeAccountModal;

    // גלגל שיניים — ניהול חשבון (מייל/התנתקות/מחיקה) יושב רמה אחת עמוק, מחוץ לתוכן היומיומי
    const gear = document.createElement('button');
    gear.className = 'account-gear';
    gear.setAttribute('aria-label', 'ניהול חשבון');
    gear.title = 'ניהול חשבון';
    gear.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';

    const h = document.createElement('h3');
    h.textContent = 'החשבון שלי';

    // טאבים
    const tabs = document.createElement('div');
    tabs.className = 'account-tabs';
    const tabDays = document.createElement('button');
    tabDays.className = 'account-tab active';
    tabDays.textContent = 'ימים';
    const tabFavs = document.createElement('button');
    tabFavs.className = 'account-tab';
    tabFavs.textContent = 'שמורים ♥';
    tabs.append(tabDays, tabFavs);

    const list = document.createElement('div');
    list.className = 'account-list';

    // תצוגת יום קריאה-בלבד (מוחלפת עם הרשימה)
    const roWrap = document.createElement('div');
    roWrap.className = 'ro-day';
    roWrap.style.display = 'none';

    // תת-מסך "ניהול חשבון" (נפתח מגלגל השיניים) — הפעולות הטכניות/ההרסניות, רמה אחת עמוק
    const settingsWrap = document.createElement('div');
    settingsWrap.className = 'account-settings';
    settingsWrap.style.display = 'none';

    function showList() {
      roWrap.style.display = 'none';
      roWrap.innerHTML = '';
      settingsWrap.style.display = 'none';
      tabs.style.display = '';
      list.style.display = '';
      gear.style.display = '';
    }
    function showRoDay(payload, title) {
      try {
        const day = deserializeDay(payload);
        roWrap.innerHTML = '';
        const back = document.createElement('button');
        back.className = 'pill-btn ro-back';
        back.textContent = '→ חזרה לרשימה';
        back.onclick = showList;
        const content = document.createElement('div');
        content.innerHTML = dayHtml(day, { readOnly: true, title });   // dayHtml עובר esc על הכל
        roWrap.append(back, content);
        tabs.style.display = 'none';
        list.style.display = 'none';
        settingsWrap.style.display = 'none';
        gear.style.display = 'none';
        roWrap.style.display = '';
        roWrap.scrollTop = 0;
      } catch (e) {
        showToastSafe('לא ניתן להציג יום זה');
      }
    }
    function showSettings() {
      tabs.style.display = 'none';
      list.style.display = 'none';
      roWrap.style.display = 'none';
      gear.style.display = 'none';
      settingsWrap.style.display = '';
      settingsWrap.scrollTop = 0;
    }
    gear.onclick = showSettings;

    function emptyMsg(t) {
      const d = document.createElement('div');
      d.className = 'account-empty';
      d.textContent = t;
      return d;
    }

    function favRow(f) {
      const row = document.createElement('div');
      row.className = 'account-row';
      const del = document.createElement('button');
      del.className = 'row-del';
      del.textContent = '✕';
      del.title = 'הסר מהמועדפים';
      del.onclick = e => {
        e.stopPropagation();
        window.removeFavorite(f.fav_id);       // העטוף — מסנכרן גם לענן
        showToastSafe('הוסר מהמועדפים');
        renderFavs();
      };
      const d = document.createElement('span');
      d.className = 'row-date';
      const t = timeLabel(f.saved_at);
      d.textContent = dateLabel(f.date) + (t ? ' · ' + t : '');
      const meta1 = document.createElement('span');
      meta1.className = 'row-meta';
      meta1.textContent = dayStats(f.payload).cal.toLocaleString() + ' קק"ל';
      row.append(del, d, meta1);
      row.onclick = () => showRoDay(f.payload, 'תפריט שמור · ' + dateLabel(f.date));
      return row;
    }

    function renderFavs() {
      list.innerHTML = '';
      let favs = [];
      try { favs = listFavorites(); } catch (e) {}
      if (!favs.length) { list.appendChild(emptyMsg('עוד אין תפריטים שמורים — לב ♡ במסך התפריט שומר אותו לכאן')); return; }
      favs.forEach(f => list.appendChild(favRow(f)));
    }

    async function renderDays() {
      list.innerHTML = '';
      list.appendChild(emptyMsg('טוען...'));
      try {
        const { data, error } = await sb.from('day_logs')
          .select('date,payload')
          .eq('trainee_id', session.user.id)
          .order('date', { ascending: false }).limit(30);
        if (error) throw error;
        list.innerHTML = '';
        if (!data || !data.length) { list.appendChild(emptyMsg('עוד אין ימים שמורים בענן — הם נאספים מעכשיו, יום אחרי יום')); return; }
        data.forEach(r => {
          const row = document.createElement('div');
          row.className = 'account-row';
          const d = document.createElement('span');
          d.className = 'row-date';
          d.textContent = (r.date === todayStr() ? 'היום · ' : '') + dateLabel(r.date);
          const s = dayStats(r.payload || {});
          const meta1 = document.createElement('span');
          meta1.className = 'row-meta';
          meta1.textContent = `נאכלו ${s.eaten}/${s.planned} · ${s.cal.toLocaleString()} קק"ל`;
          row.append(d, meta1);
          row.onclick = () => showRoDay(r.payload, 'התפריט של ' + dateLabel(r.date));
          list.appendChild(row);
        });
      } catch (e) {
        list.innerHTML = '';
        list.appendChild(emptyMsg('לא ניתן לטעון כרגע — בדוק חיבור ונסה שוב'));
      }
    }

    tabDays.onclick = () => { tabDays.classList.add('active'); tabFavs.classList.remove('active'); renderDays(); };
    tabFavs.onclick = () => { tabFavs.classList.add('active'); tabDays.classList.remove('active'); renderFavs(); };

    // ── תת-מסך "ניהול חשבון" (מייל + התנתקות + מחיקה) ──
    const setBack = document.createElement('button');
    setBack.className = 'pill-btn ro-back';
    setBack.textContent = '→ חזרה';
    setBack.onclick = showList;
    const setTitle = document.createElement('h4');
    setTitle.className = 'account-settings-title';
    setTitle.textContent = 'ניהול חשבון';
    const email = document.createElement('p');
    email.className = 'account-email';
    email.textContent = session.user.email || '';
    const logout = document.createElement('button');
    logout.className = 'account-logout';
    logout.textContent = 'התנתקות';
    logout.onclick = async () => {
      try { await sb.auth.signOut(); } catch (e) {}
      closeAccountModal();
      showToastSafe('התנתקת ✓ הנתונים במכשיר נשארו');
    };
    const del = document.createElement('button');
    del.className = 'account-delete';
    del.textContent = 'מחיקת חשבון';
    del.onclick = async () => {
      if (!confirm('למחוק את החשבון לצמיתות?\nכל הימים והתפריטים השמורים בענן יימחקו ולא ניתן יהיה לשחזר אותם.\nהנתונים השמורים במכשיר הזה יישארו.')) return;
      try {
        await sb.rpc('delete_my_account');
        await sb.auth.signOut();
        try { localStorage.removeItem(META_KEY); localStorage.removeItem('shapeat-signup-sent'); } catch (e) {}
        location.reload();
      } catch (e) { showToastSafe('המחיקה נכשלה — נסה שוב'); }
    };
    settingsWrap.append(setBack, setTitle, email, logout, del);

    box.append(x, gear, h, tabs, list, roWrap, settingsWrap);
    accountEl.appendChild(box);
    document.body.appendChild(accountEl);

    if (initialTab === 'favs') { tabFavs.click(); tabFavs.focus(); }
    else { renderDays(); tabDays.focus(); }
    accountEl.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAccountModal();
      if (e.key === 'Tab') {
        const items = [...box.querySelectorAll('button')].filter(el => !el.disabled && el.offsetParent !== null);
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
  function closeAccountModal() {
    if (accountEl) { accountEl.remove(); accountEl = null; }
    try { updateFavHeart(); } catch (e) {}   // הלב במסך התפריט משקף מחיקות שנעשו בתוך המודאל
  }
  function showToastSafe(m, ms, action) { try { showToast(m, ms, action); } catch (e) {} }

  // ══════════ אייקון חשבון קבוע בכותרת — נקודת הכניסה שפתרה את "פספסתי את הבאנר" ══════════
  let accountBtn = null;
  function injectAccountBtn() {
    const header = document.querySelector('header');
    if (!header || accountBtn) return;
    accountBtn = document.createElement('button');
    accountBtn.id = 'account-btn';
    accountBtn.className = 'account-btn';
    accountBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
    accountBtn.onclick = () => (session ? openAccountModal() : openLogin());
    updateAccountBtn();
    header.appendChild(accountBtn);
  }
  function updateAccountBtn() {
    if (!accountBtn) return;
    accountBtn.classList.toggle('connected', !!session);
    accountBtn.setAttribute('aria-label', session ? 'החשבון שלי — מחובר' : 'התחברות לחשבון');
    accountBtn.title = session ? 'החשבון שלי' : 'התחברות';
  }

  // ══════════ init ══════════
  sb.auth.onAuthStateChange((evt, sess) => {
    session = sess;
    updateAccountBtn();
    if (evt === 'SIGNED_IN') {
      closeLogin(); hideBanner();
      if (!lsGet('shapeat-signup-sent')) { lsSet('shapeat-signup-sent', '1'); track('signup'); }
      firstMerge();
      // מימוש כוונת-שמירה ששרדה את ה-redirect (בתוך חלון הזמן בלבד)
      const fi = parseInt(lsGet(FAV_INTENT_KEY), 10);
      lsSet(FAV_INTENT_KEY, '');
      if (fi && Date.now() - fi < FAV_INTENT_MS) { try { window.saveFavorite(); } catch (e) {} }
    }
    if (evt === 'SIGNED_OUT') closeAccountModal();
    if (evt === 'INITIAL_SESSION' && sess) pull();
  });

  // חשיפה מינימלית ל-UI (האייקון בכותרת משתמש בזה; שמור תאימות לקוד קיים)
  window.shapeatAccount = {
    login:  openLogin,
    openAccount: openAccountModal,
    logout: () => sb.auth.signOut(),
    deleteAccount: async () => {
      await sb.rpc('delete_my_account');
      await sb.auth.signOut();
      try { localStorage.removeItem(META_KEY); localStorage.removeItem('shapeat-signup-sent'); } catch (e) {}
    },
    isConnected: () => !!session,
  };

  // יום ראשון של שימוש נרשם; הבאנר יופיע רק מהיום השני / השלמת יום
  if (!lsGet('shapeat-first-seen')) lsSet('shapeat-first-seen', todayStr());
  injectAccountBtn();
  setTimeout(maybeShowBanner, 1500);
})();
