// ══════════════════════════════════════════
//  app.js — לוגיקה ואלגוריתם
//  גרסה 1.0 | Diat Application
// ══════════════════════════════════════════

// ── מצב האפליקציה ──
const S = {
  gender: 'male',
  goal: 'maintain',
  age: 28, height: 178, weight: 80,
  diet: new Set(),       // kosher | vegan | vegetarian | gluten_free | lactose_free | supplements
  allergy: new Set(),    // nuts | peanuts | eggs | fish | soy | sesame
  time: null,            // morning | noon | evening | null
  noTrain: false,
  liked: new Set(),      // IDs של מאכלים מועדפים
  avoided: new Set(),    // IDs של מאכלים מוחרגים
  // ערכי מאקרו מחושבים
  bmr: 0, rmr: 0, target: 0, proteinG: 0, fatG: 0, carbG: 0,
  bmiWarning: null,
  carbWarning: null,
};

// ── ALL foods flat array (מאוחד מ-DB) ──
const ALL = Object.values(DB).flat();

// ── טונה: סוג אחד בלבד לתפריט, מקסימום קופסה אחת ──
const TUNA_IDS = new Set(ALL.filter(f => f.tags.includes('tuna')).map(f => f.id));
const tunaUsed = used => [...TUNA_IDS].some(id => used.has(id));

// ערבוב (Fisher-Yates) — לגיוון בחירת מאכלים מועדפים
const shuffle = arr => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// ══════════════════════════════════════════
//  חישובי מאקרו — Harris-Benedict 1919 × 1.2
// ══════════════════════════════════════════
function calcMacro() {
  const bmr = S.gender === 'male'
    ? 66.5 + 13.75 * S.weight + 5.003 * S.height - 6.755 * S.age
    : 655.1 + 9.563 * S.weight + 1.85  * S.height - 4.676 * S.age;

  S.bmr    = Math.round(bmr);
  S.rmr    = Math.round(bmr * 1.2);
  const cutDeficit = Math.min(500, Math.round(S.rmr * 0.20));
  S.target = S.goal === 'cut'  ? S.rmr - cutDeficit
           : S.goal === 'bulk' ? S.rmr + 300
           : S.rmr;
  S.target = Math.max(S.target, S.gender === 'female' ? 1200 : 1500);

  // חלבון — לפי BMI, רצפה לנשים על שומן
  const bmi = S.weight / (S.height / 100) ** 2;
  const pw  = bmi >= 30 ? 25 * (S.height / 100) ** 2 : S.weight;
  S.proteinG = Math.round(Math.min(S.weight, pw) * 2);
  S.fatG     = Math.max(S.gender === 'female' ? 40 : 25,
                        Math.round(S.target * 0.2 / 9));
  const macroFloor = S.proteinG * 4 + S.fatG * 9 + 100 * 4;
  if (S.target < macroFloor) {
    S.target = macroFloor;
    S.carbWarning = 'הגירעון הקלורי צומצם מעט כדי לעמוד במינימום המומלץ של חלבון, שומן ופחמימות.';
  } else {
    S.carbWarning = null;
  }
  S.carbG = Math.round((S.target - S.proteinG * 4 - S.fatG * 9) / 4);
}

// ══════════════════════════════════════════
//  בדיקת התאמה לפי העדפות ואלרגיות
// ══════════════════════════════════════════
function allowed(f) {
  if (S.avoided.has(f.id)) return false;
  const a = S.allergy, d = S.diet;
  if (a.has('eggs')    && f.tags.includes('egg'))        return false;
  if (a.has('fish')    && f.tags.includes('fish'))       return false;
  if (a.has('nuts')    && f.tags.includes('nuts'))       return false;
  if (a.has('peanuts') && f.tags.includes('peanuts'))    return false;
  if (a.has('soy')     && f.tags.includes('soy'))        return false;
  if (a.has('sesame')  && f.tags.includes('sesame'))     return false;
  if (d.has('vegan')   && (f.tags.includes('meat') || f.tags.includes('fish') ||
                            f.tags.includes('dairy')|| f.tags.includes('egg'))) return false;
  if (d.has('vegetarian') && (f.tags.includes('meat') || f.tags.includes('fish'))) return false;
  if (d.has('lactose_free') && f.tags.includes('dairy')) return false;
  if (f.tags.includes('supplement') && !d.has('supplements')) return false;
  if (f.vegOnly && !d.has('vegan') && !d.has('vegetarian')) return false;
  if (f.containsMilk && (d.has('vegan') || d.has('lactose_free'))) return false;
  if (f.optIn && !S.liked.has(f.id)) return false;   // מאכלים נישתיים — רק אם סומנו במפורש
  return true;
}

// ══════════════════════════════════════════
//  כמויות חכמות
// ══════════════════════════════════════════
function eggDisplay(g, unitW, size) {
  const n = Math.max(1, Math.min(2, Math.round(g / unitW)));
  const base = n === 1 ? 'חביתה מביצה אחת' : 'חביתה משתי ביצים';
  return { label: size ? `${base} (${size})` : base, g: n * unitW };
}

function cottagePortion(targetG) {
  return targetG >= 200
    ? { g: 250, dispG: 'קופסה (250g)' }
    : { g: 125, dispG: 'חצי קופסה (125g)' };
}

function crackerPortion(targetG, unitW) {
  const n = Math.max(2, Math.min(6, Math.round(targetG / unitW)));
  return { g: n * unitW, dispG: `${n} פריכיות (${n * unitW}g)` };
}

function mkItem(f, g) {
  let dispG, displayName;
  if (f.isEgg) {
    const size = f.name.startsWith('ביצה ') ? f.name.replace('ביצה ', '') : null;
    const e = eggDisplay(g, f.unitG || 63, size); g = e.g;
    displayName = e.label;   // "חביתה מביצה אחת" / "חביתה משתי ביצים"
    dispG = '';
  } else if ((f.id === 20 || f.id === 21) && f.halfLabel) {
    const c = cottagePortion(g); g = c.g; dispG = c.dispG;
  } else if (f.tags.includes('cracker')) {
    const c = crackerPortion(g, f.unitG || 9); g = c.g; dispG = c.dispG;
  } else if (f.unitLabel) {
    dispG = f.unitLabel;
  } else {
    dispG = `${g}g`;
  }
  return {
    f, g, dispG, displayName,
    cal: Math.round(f.cal * g / 100),
    p:   Math.round(f.p   * g / 10) / 10,
    c:   Math.round(f.c   * g / 10) / 10,
    fat: Math.round(f.f   * g / 100),
    fib: Math.round((f.fib || 0) * g / 10) / 10,
  };
}

// ══════════════════════════════════════════
//  בחירת מזון — מועדפים ראשונה, ללא חזרות
// ══════════════════════════════════════════
function pick(pool, used, calT, protT, maxG) {
  // מועדפים ראשונים, אחריהם השאר — שתי הקבוצות בסדר אקראי לגיוון
  const sorted = [
    ...shuffle(pool.filter(f => S.liked.has(f.id) && allowed(f) && !used.has(f.id))),
    ...shuffle(pool.filter(f => !S.liked.has(f.id) && allowed(f) && !used.has(f.id))),
  ];
  for (const f of sorted) {
    let lim = maxG;
    if (f.maxDay) { const a = used.get(f.id) || 0; lim = Math.min(lim, f.maxDay - a); }
    if (f.maxMeal) lim = Math.min(lim, f.maxMeal);
    if (lim < 20) continue;
    let g = protT > 0 && f.p > 0
      ? Math.round(protT / f.p * 100)
      : Math.round(calT / f.cal * 100);
    if (f.unitG && !f.isEgg && !f.tags.includes('cracker') && f.id !== 20 && f.id !== 21)
      g = Math.round(g / f.unitG) * f.unitG;
    g = Math.max(f.unitG || 40, Math.min(g, lim));
    return mkItem(f, g);
  }
  return null;
}

function use(used, item) {
  if (item) used.set(item.f.id, (used.get(item.f.id) || 0) + item.g);
}

// ══════════════════════════════════════════
//  בניית סלט מאוגד (מינימום 2 ירקות רגילים + שמן זית)
// ══════════════════════════════════════════
function buildSalad(used) {
  const sortByLiked = arr => [
    ...shuffle(arr.filter(f => S.liked.has(f.id))),
    ...shuffle(arr.filter(f => !S.liked.has(f.id))),
  ];

  // ירקות רגילים (עגבנייה, מלפפון, פלפל, גזר...) — יכולים לעמוד לבד
  const regular = sortByLiked(ALL.filter(f =>
    f.tags.includes('salad') && !f.tags.includes('salad_only') &&
    allowed(f) && !used.has(f.id)
  ));
  // ירקות שמתאימים רק לסלט (חסה, כרוב, בצל)
  const extras = sortByLiked(ALL.filter(f =>
    f.tags.includes('salad_only') &&
    allowed(f) && !used.has(f.id)
  ));

  // חייבים לפחות 2 ירקות רגילים כבסיס
  if (regular.length < 2) return null;

  // רכיבי בסיס: 2 ירקות רגילים + שלישי אופציונלי (salad_only או ירק רגיל שלישי)
  const v3 = extras[0] || regular[2] || null;
  const comps = [
    { f: regular[0], g: regular[0].unitG || 120 },
    { f: regular[1], g: regular[1].unitG || 100 },
  ];
  if (v3) comps.push({ f: v3, g: v3.unitG || 80 });

  // תוספת מלוחה לסלט: אבוקדו/זיתים (אף פעם לא עם פרי!) — אם אהוב או ~30%
  const exPool = sortByLiked(ALL.filter(f => (f.id === 87 || f.id === 93) && allowed(f) && !used.has(f.id)));
  if (exPool.length && (S.liked.has(exPool[0].id) || Math.random() < 0.3))
    comps.push({ f: exPool[0], g: exPool[0].unitG || 50 });

  // שמן זית — חובה בסלט (אם מותר לפי העדפות)
  const oil = ALL.find(f => f.id === 86);
  const hasOil = oil && allowed(oil);
  const oilG = hasOil ? 5 : 0;

  const fmtPart = (f, g) => f.unitLabel || `${g}g`;   // ה-unitLabel מתאר במלואו
  const parts = comps.map(c => fmtPart(c.f, c.g));
  if (hasOil) parts.push('כפית שמן זית');

  comps.forEach(c => use(used, c));
  if (hasOil && oil) use(used, { f: oil, g: oilG });

  const sum = sel => comps.reduce((a, c) => a + (c.f[sel] || 0) * c.g / 100, 0);
  return {
    isSaladGroup: true, label: 'סלט ירק', parts,
    cal: Math.round(comps.reduce((a, c) => a + c.f.cal * c.g / 100, 0)) + (hasOil ? Math.round(oil.cal * oilG / 100) : 0),
    p:   Math.round(sum('p') * 10) / 10,
    c:   Math.round(sum('c') * 10) / 10,
    fat: Math.round((sum('f') + (hasOil ? oil.f * oilG / 100 : 0)) * 10) / 10,
    fib: Math.round(sum('fib') * 10) / 10,
  };
}

function buildSingleVeg(used, hotOk) {
  const tag = hotOk ? 'hot_veg' : 'salad';
  const pool = ALL.filter(f =>
    f.tags.includes(tag) && allowed(f) && !used.has(f.id) && !f.tags.includes('salad_only')
  );
  const sorted = [...shuffle(pool.filter(f => S.liked.has(f.id))), ...shuffle(pool.filter(f => !S.liked.has(f.id)))];
  if (!sorted.length) return null;
  const f = sorted[0], g = f.unitG || 100;
  use(used, { f, g });
  return mkItem(f, g);
}

// ══════════════════════════════════════════
//  בניית ארוחות לפי סוג
// ══════════════════════════════════════════
// ── תבניות ארוחה (archetypes) — כל ארוחה לפי תבנית מציאותית ──
const _tag = t => f => f.tags.includes(t);
const isYogurt = f => f.id === 22 || f.id === 23 || f.id === 24;
const isCheese = f => f.id === 20 || f.id === 21 || f.id === 25 || f.id === 26; // קוטג'/לבנה/צהובה
const _sliced  = f => f.tags.includes('bread') && !f.pita; // לחם/פריכית, לא פיתה (פיתה רק עם חלבון ממולא)

const MEAL_TEMPLATES = {
  breakfast: [
    { name:'eggs',        weight:3, slots:[
      { match:_tag('egg'),   calPct:.45, protPct:.85, max:300 },
      { match:_tag('bread'), calPct:.35, max:120, spread:'ifAlone', pitaOk:true },   // פיתה מותרת כאן (עם חביתה), בעדיפות נמוכה
      { special:'salad', optional:true },
    ]},
    { name:'cheese',      weight:3, slots:[
      { match:isCheese,      calPct:.45, protPct:.85, max:200 },
      { match:_sliced,       calPct:.35, max:120, spread:'ifAlone' },   // לחם/פריכית, לא פיתה
      { special:'salad', optional:true },
    ]},
    { name:'yogurt_bowl', weight:2, slots:[
      { match:isYogurt,      calPct:.5, protPct:.8, max:250 },
      { match:_tag('granola'), calPct:.3, max:60, optional:true },   // גרנולה בלבד (לא שיבולת מבושלת)
      { match:_tag('fruit'), calPct:.2, max:200, optional:true },
    ]},
    { name:'porridge',    weight:2, slots:[
      { match:f => f.id === 106, calPct:.6, max:350 },
      { match:_tag('fruit'),     calPct:.4, max:200, optional:true },
    ]},
    { name:'cornflakes',  weight:2, slots:[
      { match:f => f.id === 108, calPct:.4, max:60 },
      { match:f => f.drink,      calPct:.35, max:250 },
      { match:_tag('fruit'),     calPct:.25, max:200, optional:true },
    ]},
    { name:'oats_water',  weight:1, slots:[   // צמחוני/טבעוני וגיוון: שיבולת במים
      { match:f => f.id === 41, calPct:.5, max:300 },
      { match:_tag('fruit'), calPct:.3, max:200, optional:true },
      { match:_tag('nuts'), calPct:.2, max:30, optional:true },   // אגוזים בלבד
    ]},
  ],
  hot: [
    { name:'meat',   weight:3, slots:[
      { match:f => (f.tags.includes('meat') || f.tags.includes('fish')) && !f.tags.includes('tuna'), calPct:.45, protPct:.9, max:300 },
      { special:'hot_side', calPct:.4, max:250 },   // תוספת אחת: דגן או קטנייה (לא שתיהן)
      { special:'hotveg_or_salad', optional:true },
      { special:'dip', optional:true },             // ~25%: חומוס/טחינה בצד
    ]},
    // קטנייה כעיקרית — רק לצמחוני/טבעוני (אין להם בשר)
    { name:'legume', weight:1, when:u => !ALL.some(f => (f.tags.includes('meat') || f.tags.includes('fish')) && !f.tags.includes('tuna') && allowed(f) && !u.has(f.id)), slots:[
      { match:f => f.tags.includes('legume') && !f.dip, calPct:.4, protPct:.9, max:300 },
      { special:'hot_carb', calPct:.4, max:250 },
      { special:'hotveg_or_salad', optional:true },
      { special:'dip', optional:true },             // ~25%: חומוס/טחינה בצד
    ]},
    // הערה: אין טונה בארוחה חמה — צהריים = בשר/דג מבושל. טונה זמינה בארוחת ערב (tuna_bread).
  ],
  snack: [
    { name:'dairy_fruit',    weight:3, slots:[
      { match:f => isYogurt(f) || f.id === 20 || f.id === 21, calPct:.6, protPct:.85, max:250 },  // קוטג'/יוגורט (לא גבינה לבנה/צהובה — אלו עם לחם/פריכית)
      { match:_tag('fruit'), calPct:.4, max:200, optional:true },
    ]},
    { name:'fruit_nuts',     weight:2, slots:[
      { match:_tag('fruit'), calPct:.55, max:200 },
      { match:_tag('nuts'), calPct:.45, max:30 },   // אגוזים אמיתיים בלבד (לא אבוקדו/זיתים)
    ]},
    { name:'cracker_cheese', weight:2, slots:[
      { match:isCheese, calPct:.45, protPct:.6, max:120, optional:true },
      { match:_tag('cracker'), calPct:.45, max:54, spread:'ifAlone' },
    ]},
    { name:'shake',          weight:2, slots:[
      { match:_tag('supplement'), calPct:.7, protPct:.9, max:60 },
      { match:_tag('fruit'), calPct:.3, max:200, optional:true },
    ]},
  ],
  dinner: [
    { name:'cheese_bread', weight:3, slots:[
      { match:f => isCheese(f) || f.tags.includes('egg'), calPct:.45, protPct:.8, max:250 },
      { match:_sliced, calPct:.25, max:120, spread:'ifAlone', optional:true },   // לחם פרוס, לא פיתה
      { special:'salad', optional:true },
    ]},
    { name:'tuna_bread',   weight:2, slots:[
      { match:(f, u) => f.tags.includes('tuna') && !tunaUsed(u), calPct:.4, protPct:.8, max:160 },
      { match:_sliced, calPct:.25, max:120, spread:'ifAlone', optional:true },   // לחם פרוס, לא פיתה
      { special:'salad', optional:true },
    ]},
    { name:'big_salad',    weight:2, slots:[
      { special:'salad' },
      { match:f => f.tags.includes('egg') || isCheese(f) || (f.tags.includes('legume') && !f.dip), calPct:.45, protPct:.8, max:250 },
      { match:_sliced, calPct:.2, max:80, spread:'ifAlone', optional:true },   // לחם פרוס, לא פיתה
    ]},
  ],
};

// ממרח (טחינה/חמאת בוטנים) — נצמד ללחם/פריכייה: השם מציין "עם X",
// והממרח עצמו מקבל שורה נפרדת עם כמות וקלוריות משלו. מחזיר את שורת הממרח (או null).
function makeSpread(breadItem, used) {
  const spreads = ALL.filter(f => f.condiment && !f.tags.includes('oil') && allowed(f) && !used.has(f.id));
  if (!spreads.length) return null;
  const liked = spreads.filter(f => S.liked.has(f.id));
  if (!liked.length && Math.random() >= 0.4) return null;
  const pool = liked.length ? liked : spreads;
  const f = pool[Math.floor(Math.random() * pool.length)];
  const g = f.unitG || 15;
  breadItem.displayName = (breadItem.displayName || breadItem.f.name) + ' עם ' + f.name;
  use(used, { f, g });
  return mkItem(f, g);
}

const SELF_USE = ['salad', 'hotveg', 'hotveg_or_salad']; // ממלאים את used בעצמם

function buildFromTemplate(tpl, cal, used, ctx) {
  const items = [];
  const protShare = S.proteinG * cal / S.target;
  let hasProtein = false;
  for (const s of tpl.slots) {
    let item = null;
    if (s.special === 'salad') {
      item = buildSalad(used);
    } else if (s.special === 'hotveg') {
      item = buildSingleVeg(used, true);
    } else if (s.special === 'hotveg_or_salad') {
      const ph = Math.random() < 0.4;
      item = ph ? buildSingleVeg(used, true) : buildSalad(used);
      if (!item) item = ph ? buildSalad(used) : buildSingleVeg(used, true);
    } else if (s.special === 'hot_carb' || s.special === 'hot_side') {
      // hot_side: לפעמים קטנייה כתוספת לצד הבשר (במקום דגן), אחרת דגן חם
      if (s.special === 'hot_side') {
        const wantLeg = ALL.some(f => f.tags.includes('legume') && !f.dip && S.liked.has(f.id) && allowed(f)) || Math.random() < 0.25;
        if (wantLeg) item = pick(ALL.filter(f => f.tags.includes('legume') && !f.dip), used, cal * (s.calPct || .4), 0, s.max || 250);
      }
      if (!item) {
        const getCarbCat = f => f.tags.find(t => t === 'grain' || t === 'starch') || 'other';
        const allHc = ALL.filter(f => f.tags.includes('hot_carb'));
        const cats = (ctx && ctx.usedCarbCats) || new Set();
        const prefHc = allHc.filter(f => !cats.has(getCarbCat(f)));
        item = pick(prefHc.length ? prefHc : allHc, used, cal * (s.calPct || .4), 0, s.max || 250);
        if (item) cats.add(getCarbCat(item.f));
      }
    } else if (s.special === 'dip') {
      // ~25% (או אם אהוב): חומוס/טחינה כמטבל בצד — שורה משלו
      const dips = ALL.filter(f => f.dip && allowed(f) && !used.has(f.id));
      const wantDip = dips.some(f => S.liked.has(f.id)) || Math.random() < 0.25;
      if (wantDip && dips.length) item = pick(dips, used, cal * (s.calPct || .15), 0, s.max || 50);
    } else {
      let pool = ALL.filter(f => s.match(f, used));
      // פיתה בעדיפות נמוכה ורק במשבצת שמסומנת pitaOk (חביתה); אחרת לחם/פריכיות
      if (pool.some(f => f.pita) && (!s.pitaOk || Math.random() >= 0.3)) pool = pool.filter(f => !f.pita);
      item = pick(pool, used, cal * (s.calPct || .3), s.protPct ? protShare * s.protPct : 0, s.max || 250);
    }
    if (!item) continue;
    // ממרח רק כשאין כבר חלבון בארוחה (קוטג'/ביצה/טונה ⇐ אין צורך בממרח)
    let spreadItem = null;
    if (s.spread && !item.isSaladGroup && !(s.spread === 'ifAlone' && hasProtein))
      spreadItem = makeSpread(item, used);
    items.push(item);
    if (!SELF_USE.includes(s.special)) use(used, item);
    if (spreadItem) items.push(spreadItem);
    if (s.protPct) hasProtein = true;
  }
  return items;
}

function slotFeasible(s, used) {
  if (s.optional) return true;
  if (s.special === 'salad')
    return ALL.filter(f => f.tags.includes('salad') && !f.tags.includes('salad_only') && allowed(f) && !used.has(f.id)).length >= 2;
  if (s.special) return true; // hot_carb / hotveg — כמעט תמיד זמינים
  return ALL.some(f => s.match(f, used) && allowed(f) && !used.has(f.id));
}
function tplHasLiked(tpl, used) {
  return tpl.slots.some(s => !s.special && ALL.some(f => s.match(f, used) && S.liked.has(f.id) && allowed(f)));
}
function chooseTemplate(list, used) {
  const feasible = list.filter(tpl => (!tpl.when || tpl.when(used)) && tpl.slots.every(s => slotFeasible(s, used)));
  if (!feasible.length) return null;
  const liked = feasible.filter(tpl => tplHasLiked(tpl, used));
  const pool = liked.length ? liked : feasible;
  const total = pool.reduce((a, t) => a + (t.weight || 1), 0);
  let r = Math.random() * total;
  for (const t of pool) { r -= (t.weight || 1); if (r <= 0) return t; }
  return pool[0];
}

function buildMeal(type, cal, used, ctx) {
  const tpl = chooseTemplate(MEAL_TEMPLATES[type], used);
  return tpl ? buildFromTemplate(tpl, cal, used, ctx) : [];
}

// ══════════════════════════════════════════
//  בניית תפריט מלא
// ══════════════════════════════════════════
function buildMenu() {
  calcMacro();

  // אזהרת BMI נמוך מדי לחיטוב
  const bmi = S.weight / (S.height / 100) ** 2;
  S.bmiWarning = (S.goal === 'cut' && bmi < 20)
    ? `BMI שלך הוא ${bmi.toFixed(1)} — נמוך. חיטוב במשקל זה עלול לגרום לנזק בריאותי ולפגיעה במסת השריר. מומלץ לשקול שמירה או בניית מסה.`
    : (S.goal === 'bulk' && bmi >= 30)
    ? `BMI שלך הוא ${bmi.toFixed(1)} — גבוה. בתפריט מסה עם BMI כזה מומלץ להתייעץ עם תזונאי או רופא לפני שמתחילים.`
    : null;

  const t = S.target;
  const key = (S.noTrain || !S.time) ? 'noTrain' : S.time;
  const mealDefs = MEAL_TIMES[key];
  const used = new Map();
  const ctx = { usedCarbCats: new Set() }; // גיוון קטגוריות פחמימה לאורך היום

  const meals = mealDefs.map(def => {
    const budget = Math.round(t * def.pct);
    const items = buildMeal(def.type, budget, used, ctx);
    const totCal = items.reduce((s, x) => s + x.cal, 0);
    const totP   = Math.round(items.reduce((s, x) => s + (x.p   || 0), 0) * 10) / 10;
    const totC   = Math.round(items.reduce((s, x) => s + (x.c   || 0), 0) * 10) / 10;
    const totF   = Math.round(items.reduce((s, x) => s + (x.fat || 0), 0) * 10) / 10;
    const totFib = Math.round(items.reduce((s, x) => s + (x.fib || 0), 0) * 10) / 10;
    return { ...def, budget, items, totCal, totP, totC, totF, totFib };
  });

  // ערובת פרי: אם לא נכנס אף פרי ליום והקלוריות מאפשרות — מוסיפים לנשנוש (או לאחרונה)
  const fruitIds = new Set(ALL.filter(f => f.tags.includes('fruit')).map(f => f.id));
  const hasFruit = [...used.keys()].some(id => fruitIds.has(id));
  if (!hasFruit && S.target > 1200) {
    const snackIdx = meals.findIndex(m => m.type === 'snack');
    const idx = snackIdx >= 0 ? snackIdx : meals.length - 1;
    const fr = pick(ALL.filter(f => f.tags.includes('fruit')), used, 120, 0, 250);
    if (fr) {
      use(used, fr);
      const meal = meals[idx];
      meal.items.push(fr);
      meal.totCal += fr.cal;
      meal.totP = Math.round((meal.totP + (fr.p   || 0)) * 10) / 10;
      meal.totC = Math.round((meal.totC + (fr.c   || 0)) * 10) / 10;
      meal.totF = Math.round((meal.totF + (fr.fat || 0)) * 10) / 10;
      meal.totFib = Math.round((meal.totFib + (fr.fib || 0)) * 10) / 10;
    }
  }

  return meals;
}
