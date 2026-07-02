/* ══════════════════════════════════════════
   coach-theme.js — מיתוג מאמן (white-label, שלב 0)
   נטען ראשון (לפני data/app/ui) כדי להחיל צבעים מוקדם.
   מקור המיתוג: coaches.json בריפו (שלב 2: טבלת coaches_public ב-Supabase).
   עקרונות: כל כשל ⇒ ברירת המחדל של ShapEat; שם/סלוגן רק דרך textContent (XSS);
   צבע עובר סף ניגודיות מול טקסט לבן; שורת "מופעל ע"י ShapEat" קבועה (מיגון משפטי).
   ══════════════════════════════════════════ */
(function () {
  'use strict';

  const KEY = 'shapeat-coach';
  const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;   // ASCII בלבד, כמו ה-check ב-DB
  const HEX_RE  = /^#[0-9a-fA-F]{6}$/;

  // ── שלב א: מי המאמן? פרמטר ב-URL גובר; אחרת מה שנשמר מביקור קודם ──
  let slug = null;
  try {
    const param = new URLSearchParams(location.search).get('coach');
    if (param !== null) {
      const s = param.trim().toLowerCase();
      if (SLUG_RE.test(s)) { slug = s; localStorage.setItem(KEY, s); }
      else localStorage.removeItem(KEY);          // ?coach= ריק/שגוי = הסרת מיתוג מפורשת
    } else {
      slug = localStorage.getItem(KEY);
      if (slug && !SLUG_RE.test(slug)) { slug = null; localStorage.removeItem(KEY); }
    }
  } catch (e) { slug = null; }                    // localStorage חסום — בלי מיתוג

  if (!slug) return;

  // ── ניגודיות: מכהים את צבע המאמן עד שטקסט לבן עליו עומד ב-4.5:1 (WCAG AA) ──
  function relLum(hex) {
    const c = [1, 3, 5].map(i => {
      let v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ensureContrast(hex) {
    let rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    for (let i = 0; i < 12; i++) {
      const h = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
      if (1.05 / (relLum(h) + 0.05) >= 4.5) return h;   // ניגודיות מול לבן
      rgb = rgb.map(v => Math.floor(v * 0.85));          // כהה יותר ב-15%
    }
    return '#4f46e5';                                    // לא הצליח — צבע הבית
  }

  // ── שלב ב: טעינת המיתוג והחלה ──
  fetch('coaches.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('http ' + r.status))))
    .then(list => {
      const c = Array.isArray(list) ? list.find(x => x && x.slug === slug) : null;
      if (!c) {                                   // המאמן ירד מהרשימה — חוזרים למותג הבית
        try { localStorage.removeItem(KEY); } catch (e) {}
        return;
      }
      apply(c);
    })
    .catch(() => { /* רשת/קובץ נפלו — בלי מיתוג הפעם, בלי למחוק את השיוך (offline-first) */ });

  function apply(c) {
    // צבעים — מיד (לפני רינדור), רק אחרי ולידציה וסף ניגודיות
    const root = document.documentElement;
    if (HEX_RE.test(c.color || '')) {
      const main = ensureContrast(c.color);
      root.style.setProperty('--accent', main);
      root.style.setProperty('--accent-2', HEX_RE.test(c.color2 || '') ? ensureContrast(c.color2) : main);
      root.style.setProperty('--text-info', main);
    }

    // DOM — אחרי שה-header קיים
    const onReady = fn => document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', fn) : fn();
    onReady(() => {
      const img   = document.querySelector('.logo-img');
      const text  = document.querySelector('.logo-text');
      const tag   = document.querySelector('.logo-tag');
      const stack = document.querySelector('.logo-stack');
      if (!img || !text || !stack) return;

      const name = typeof c.name === 'string' ? c.name.slice(0, 40).trim() : '';

      if (typeof c.logo === 'string' && /^brand\/coaches\/[\w.-]+\.(png|webp|jpg)$/.test(c.logo)) {
        img.src = c.logo;                          // נתיב מוגבל לתיקיית הלוגואים בלבד
        if (name) img.alt = name;
      } else {                                     // אין לוגו — מונוגרמה בצבעי המאמן
        const mono = document.createElement('div');
        mono.className = 'coach-monogram';
        mono.textContent = name ? name.charAt(0) : 'S';
        img.replaceWith(mono);
      }

      if (name) text.textContent = name;           // textContent בלבד — לא innerHTML
      if (tag && typeof c.tagline === 'string' && c.tagline.trim())
        tag.textContent = c.tagline.slice(0, 80).trim();

      // מיגון משפטי — שורה קבועה, לא ניתנת להסרה דרך coaches.json
      const pb = document.createElement('span');
      pb.className = 'coach-powered';
      pb.textContent = 'מופעל ע"י ShapEat · תפריט לדוגמה מחושב אוטומטית';
      stack.appendChild(pb);
    });
  }
})();
