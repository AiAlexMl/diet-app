// ══════════════════════════════════════════
//  app.js — לוגיקה ואלגוריתם
//  גרסה 1.0 | Diet Application
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
  menuWarning: null,    // מוצג כשאי אפשר לעמוד ביעד עם ההעדפות (גלישה קלורית בלתי-פתירה)
};

// ── ALL foods flat array (מאוחד מ-DB) ──
const ALL = Object.values(DB).flat();

// ── טונה: סוג אחד בלבד לתפריט, מקסימום קופסה אחת ──
const TUNA_IDS = new Set(ALL.filter(f => f.tags.includes('tuna')).map(f => f.id));
const tunaUsed = used => [...TUNA_IDS].some(id => used.has(id));

// ── קוטג': סוג אחד בלבד לתפריט (3% או 5%, לא שניהם) — נאכף בסינון של pick ──
const COTTAGE_IDS = [20, 21];
const variantBlocked = (f, used) =>
  COTTAGE_IDS.includes(f.id) && COTTAGE_IDS.some(id => id !== f.id && used.has(id));

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

  // חלבון — לפי BMI, רצפה לנשים על שומן. טבעונים: 1.6g/ק"ג (קשה להגיע ל-2 מצמחי); אחרים: 2g/ק"ג
  const bmi = S.weight / (S.height / 100) ** 2;
  const pw  = bmi >= 30 ? 25 * (S.height / 100) ** 2 : S.weight;
  const pf  = S.diet.has('vegan') ? 1.6 : 2;
  S.proteinG = Math.round(Math.min(S.weight, pw) * pf);
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
  if (d.has('gluten_free') && f.tags.includes('gluten')) return false;   // ללא גלוטן — מחריג חיטה/שיפון/שיבולת שועל וכו'
  if (f.gfOnly && !d.has('gluten_free')) return false;   // פריטים ייעודיים ללא גלוטן — רק למשתמשי GF
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

// קובע cal/p/c/fat/fib על פריט לפי המזון f וכמות g (ערכי המזון תמיד ל-100g). משמש בכל מקום
// שבונה/מעדכן כמות — מונע שכפול של נוסחת המאקרו.
function setMacros(it, f, g) {
  it.cal = Math.round(f.cal * g / 100);
  it.p   = Math.round(f.p   * g / 10) / 10;
  it.c   = Math.round(f.c   * g / 10) / 10;
  it.fat = Math.round(f.f   * g / 100);
  it.fib = Math.round((f.fib || 0) * g / 10) / 10;
  return it;
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
  } else if (f.plural && f.unitG) {
    // פריט יחידות (פרי/לחם/עמילני/גביע) — מצמידים ליחידות שלמות והתווית אומרת אמת:
    // "תמר אחד" לא יסתיר 72g, "גביע (170g)" לא יסתיר 250g
    const n = Math.max(1, Math.round(g / f.unitG));
    g = n * f.unitG;
    dispG = n === 1 ? f.unitLabel : `${n} ${f.plural}`;
  } else if (f.unitLabel) {
    dispG = f.unitLabel;
  } else {
    dispG = `${g}g`;
  }
  return setMacros({ f, g, dispG, displayName }, f, g);
}

// ══════════════════════════════════════════
//  בחירת מזון — מועדפים ראשונה, ללא חזרות
// ══════════════════════════════════════════
function pick(pool, used, calT, protT, maxG) {
  // מועדפים ראשונים, אחריהם השאר — שתי הקבוצות בסדר אקראי לגיוון
  const ok = f => allowed(f) && !used.has(f.id) && !variantBlocked(f, used);
  const sorted = [
    ...shuffle(pool.filter(f => S.liked.has(f.id) && ok(f))),
    ...shuffle(pool.filter(f => !S.liked.has(f.id) && ok(f))),
  ];
  for (const f of sorted) {
    let lim = maxG, hard = Infinity;   // hard = תקרה קשיחה (maxDay/maxMeal); maxG הוא רק יעד גודל רך
    if (f.maxDay) { const a = used.get(f.id) || 0; hard = Math.min(hard, f.maxDay - a); }
    if (f.maxMeal) hard = Math.min(hard, f.maxMeal);
    lim = Math.min(lim, hard);
    if (lim < 20 || hard < (f.unitG || 40)) continue;   // אין מקום למנת מינימום — רצפת ה-clamp הייתה חורגת מהתקרה הקשיחה
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
// חישוב-מחדש של קבוצת סלט מתוך הרכיבים הגולמיים (_comps) וכמות השמן (_oilG).
// מאפשר ל-reconcile לכוונן את השמן (מנוף שומן חלק) ולעדכן את התצוגה והמאקרו.
function recalcSalad(sg) {
  const comps = sg._comps, oil = sg._oil, oilG = sg._oilG || 0;
  const fmtPart = (f, g) => f.unitLabel || `${g}g`;
  const parts = comps.map(c => fmtPart(c.f, c.g));
  if (oil && oilG > 0) parts.push(oilG === 5 ? 'כפית שמן זית' : `${oilG / 5} כפיות שמן זית`);
  sg.parts = parts;
  const sum = sel => comps.reduce((a, c) => a + (c.f[sel] || 0) * c.g / 100, 0);
  sg.cal = Math.round(comps.reduce((a, c) => a + c.f.cal * c.g / 100, 0)) + (oil && oilG ? Math.round(oil.cal * oilG / 100) : 0);
  sg.p   = Math.round(sum('p') * 10) / 10;
  sg.c   = Math.round(sum('c') * 10) / 10;
  sg.fat = Math.round((sum('f') + (oil && oilG ? oil.f * oilG / 100 : 0)) * 10) / 10;
  sg.fib = Math.round(sum('fib') * 10) / 10;
  return sg;
}

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

  comps.forEach(c => use(used, c));
  if (hasOil && oil) use(used, { f: oil, g: oilG });

  // שומרים את הרכיבים הגולמיים + השמן כדי ש-reconcile יוכל לכוונן (recalcSalad)
  const sg = { isSaladGroup: true, label: 'סלט ירק',
    _comps: comps, _oil: hasOil ? oil : null, _oilG: oilG };
  return recalcSalad(sg);
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
// האם יש חלבון מן החי זמין למשתמש (ביצה/בשר/דג/חלב)? אם כן — קטנייה אינה ה"חלבון" בסלט
const hasAnimalProtein = () => ALL.some(f =>
  (f.tags.includes('egg') || f.tags.includes('meat') || f.tags.includes('fish') || f.tags.includes('dairy')) && allowed(f));

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
    // טבעוני (ובפרט טבעוני+ללא גלוטן): לחם/פריכית עם ממרח + פרי/אגוזים — רק כשאין ביצה/חלב זמינים
    { name:'bread_spread', weight:1, when:u => !ALL.some(f => (f.tags.includes('egg') || f.tags.includes('dairy')) && allowed(f) && !u.has(f.id)), slots:[
      { match:_sliced, calPct:.5, max:120, spread:'ifAlone' },
      { match:_tag('fruit'), calPct:.3, max:200, optional:true },
      { match:_tag('nuts'), calPct:.2, max:30, optional:true },
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
      // חלבון: ביצה/גבינה (מן החי). קטנייה רק כשאין למשתמש חלבון מן החי (טבעוני) — שעועית אינה "מנת חלבון" לאוכלי-כול
      { match:f => f.tags.includes('egg') || isCheese(f) || (f.tags.includes('legume') && !f.dip && !hasAnimalProtein()), calPct:.45, protPct:.8, max:250 },
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

// כשרות: בלי בשר וחלב באותה ארוחה (דג+חלב מותר — טונה+קוטג' נשאר). התבניות ממילא
// לא מערבבות, אבל זו ערובה מפורשת שתחזיק גם מול תבניות עתידיות.
const kosherOk = (f, mealTags) => !S.diet.has('kosher') ||
  !((f.tags.includes('dairy') && mealTags.has('meat')) ||
    (f.tags.includes('meat')  && mealTags.has('dairy')));

function buildFromTemplate(tpl, cal, used, ctx) {
  const items = [];
  const protShare = S.proteinG * cal / S.target;
  const mealTags = new Set();   // תגי הפריטים שכבר בארוחה — לאכיפת כשרות
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
      // hot_side: קטנייה כתוספת לצד הבשר רק אם המשתמש אוהב אותה; אחרת דגן חם (גמיש, חשוב לדיוק קלורי)
      if (s.special === 'hot_side') {
        const wantLeg = ALL.some(f => f.tags.includes('legume') && !f.dip && S.liked.has(f.id) && allowed(f));
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
      const dips = ALL.filter(f => f.dip && allowed(f) && !used.has(f.id) && kosherOk(f, mealTags));
      const wantDip = dips.some(f => S.liked.has(f.id)) || Math.random() < 0.25;
      if (wantDip && dips.length) item = pick(dips, used, cal * (s.calPct || .15), 0, s.max || 50);
    } else {
      let pool = ALL.filter(f => s.match(f, used) && kosherOk(f, mealTags));
      // פיתה בעדיפות נמוכה ורק במשבצת שמסומנת pitaOk (חביתה); אחרת לחם/פריכיות
      if (pool.some(f => f.pita) && (!s.pitaOk || Math.random() >= 0.3)) pool = pool.filter(f => !f.pita);
      item = pick(pool, used, cal * (s.calPct || .3), s.protPct ? protShare * s.protPct : 0, s.max || 250);
    }
    if (!item) continue;
    if (item.f) item.f.tags.forEach(t => mealTags.add(t));   // עדכון תגי הארוחה (סלט = ירקות בלבד, לא רלוונטי לכשרות)
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

// "החלפת ארוחה שמתאימה": בונים ~3 פעמים (תבניות אקראיות) ובוחרים את הקרובה ביותר לתקציב הקלורי,
// כדי לדייק בלי לנפח מנה בודדת. עובדים על עותק של used ומאמצים את ניצולי הזוכה.
function buildMealBest(type, budget, used, ctx) {
  const expFat = S.fatG * budget / Math.max(S.target, 1);   // חלק השומן הצפוי לארוחה
  let best = null, bestUsed = null, bestScore = Infinity;
  for (let i = 0; i < 4; i++) {
    const u = new Map(used);
    const items = buildMeal(type, budget, u, ctx);
    if (!items.length) continue;
    const cal = items.reduce((s, x) => s + x.cal, 0);
    const fat = items.reduce((s, x) => s + (x.fat || 0), 0);
    // ניקוד: קרבה לתקציב קלורי + עדיפות לבנייה רזה (כדי לרסן שומן מהמקור)
    const score = Math.abs(cal - budget) / Math.max(budget, 1) + 0.6 * Math.max(0, fat - expFat) / Math.max(expFat, 8);
    if (score < bestScore) { bestScore = score; best = items; bestUsed = u; }
  }
  if (bestUsed) { used.clear(); bestUsed.forEach((v, k) => used.set(k, v)); }
  return best || [];
}

// ══════════════════════════════════════════
//  יישור מאקרו ליעד — reconcile (חלבון ±7% → שומן ±8% → קלוריות ±4%)
// ══════════════════════════════════════════
const CAL_TOL  = 0.04;
const PROT_TOL = 0.07;
const FAT_TOL  = 0.08;

// המנופים שבהם reconcile מכוונן כמויות. כולם מעדכנים g + dispG (תווית אמת) + מאקרו (setMacros).
function reG(it, g) {            // כמות חופשית בגרמים (דגן/בשר/דג/קטנייה)
  it.g = g; it.dispG = `${g}g`;
  setMacros(it, it.f, g);
}
function reBread(it, count) {    // לחם פרוס לפי מספר פרוסות (1–4): "פרוסה אחת" / "N פרוסות"
  count = Math.max(1, Math.min(4, count || 1));
  it.g = count * (it.f.unitG || 30);
  it.dispG = count === 1 ? (it.f.unitLabel || 'פרוסה אחת') : `${count} פרוסות`;
  setMacros(it, it.f, it.g);
}
function reNuts(it, g) {         // אגוזים בגרמים (10–40) — מנוף שומן עדין; תווית "15g שקדים"
  it.g = Math.max(10, Math.min(40, Math.round(g))); it.dispG = `${it.g}g`;
  setMacros(it, it.f, it.g);
}
function reCracker(it, targetG) {  // פריכיות לפי מספר יחידות (2–6, דרך crackerPortion)
  const c = crackerPortion(targetG, it.f.unitG || 9);
  it.g = c.g; it.dispG = c.dispG;
  setMacros(it, it.f, c.g);
}
function reUnit(it, count) {     // ירק עמילני לפי יחידות שלמות (1–3, תקרת CARBCAP): "2 תפוחי אדמה בינוניים"
  const maxN = Math.max(1, Math.min(3, Math.floor(450 / it.f.unitG)));
  count = Math.max(1, Math.min(maxN, count || 1));
  it.g = count * it.f.unitG;
  it.dispG = count === 1 ? it.f.unitLabel : `${count} ${it.f.plural}`;
  setMacros(it, it.f, it.g);
}

function recalcMeal(m) {
  m.totCal = m.items.reduce((s, x) => s + x.cal, 0);
  m.totP   = Math.round(m.items.reduce((s, x) => s + (x.p   || 0), 0) * 10) / 10;
  m.totC   = Math.round(m.items.reduce((s, x) => s + (x.c   || 0), 0) * 10) / 10;
  m.totF   = Math.round(m.items.reduce((s, x) => s + (x.fat || 0), 0) * 10) / 10;
  m.totFib = Math.round(m.items.reduce((s, x) => s + (x.fib || 0), 0) * 10) / 10;
}

// כיוונון ביצה: בוחר גודל (M/15 ל-L/16 ל-XL/17) וכמות (1–2) הכי קרובים ליעד הגרמים.
// ערכי המאקרו ל-100g זהים בכל הגדלים — רק המשקל משתנה.
function adjustEgg(it, targetG) {
  const sizes = [15, 16, 17].map(id => ALL.find(f => f.id === id)).filter(Boolean);
  let best = null, bestDiff = Infinity;
  for (const ef of sizes) for (const n of [1, 2]) {
    const g = ef.unitG * n, d = Math.abs(g - targetG);
    if (d < bestDiff) { bestDiff = d; best = { ef, g }; }
  }
  if (!best) return;
  it.f = best.ef;
  const size = best.ef.name.replace('ביצה ', '');
  const e = eggDisplay(best.g, best.ef.unitG, size);
  it.g = e.g; it.displayName = e.label; it.dispG = '';
  setMacros(it, best.ef, it.g);
}

// כיוונון שומן (שלב 2): שמן סלט → אגוזים קיימים → הוספת אגוזים לנשנוש → החלפת חלבון שמן ברזה.
// שמן זית = 100% שומן (רציף), ולכן השומן מתכוונן עדין; ההחלפה לרזה פותרת "שומן תקוע גבוה".
function adjustFat(meals) {
  const items = meals.flatMap(m => m.items);
  const usedIds = new Set(items.map(it => it.f && it.f.id));
  const dF = meals.reduce((s, m) => s + m.totF, 0);
  let delta = S.fatG - dF;                        // חיובי = להוסיף שומן
  if (Math.abs(delta) <= S.fatG * FAT_TOL) return;
  const snapOil = g => Math.max(0, Math.min(10, Math.round(g / 5) * 5));   // 0/1/2 כפיות

  if (delta > 0) {
    // 1) שמן סלט (גרם שמן = גרם שומן), בכפיות שלמות
    items.filter(it => it.isSaladGroup && it._oil).forEach(sg => {
      if (delta <= 0) return;
      const before = sg._oilG || 0;
      sg._oilG = snapOil(before + delta);
      delta -= (sg._oilG - before); recalcSalad(sg);
    });
    // 2) אגוזים קיימים (גרם אגוז = f% שומן)
    items.filter(it => it.f && it.f.tags.includes('nuts')).forEach(it => {
      if (delta <= 0 || !it.f.f) return;
      const before = it.fat;
      reNuts(it, it.g + delta / (it.f.f / 100));
      delta -= (it.fat - before);
    });
    // 3) אם עדיין חסר ואין אגוזים כלל — מנת אגוזים קטנה לנשנוש (בית הגיוני לאגוזים)
    if (delta > S.fatG * FAT_TOL && !items.some(it => it.f && it.f.tags.includes('nuts'))) {
      const snack = meals.find(m => m.type === 'snack') || meals[meals.length - 1];
      const cand = [88, 89, 90].map(id => ALL.find(f => f.id === id)).filter(f => f && allowed(f) && !usedIds.has(f.id));
      const nut = cand.find(f => S.liked.has(f.id)) || cand[0];
      if (snack && nut && nut.f) {
        const it = mkItem(nut, nut.unitG || 30);
        reNuts(it, delta / (nut.f / 100));
        snack.items.push(it);
      }
    }
  } else {
    let need = -delta;                            // גרם שומן להוריד
    // 0) החלפה לגרסה רזה ששומרת חלבון/מנה: טונה בשמן→במים, קוטג' 5%→3%, יוגורט 5%→0% (יש לזה הכי הרבה תשואה)
    const LEANER = { 9: 10, 20: 21, 24: 23 };
    items.forEach(it => {
      if (need <= 0 || !it.f || !(it.f.id in LEANER) || S.liked.has(it.f.id)) return;   // לא מחליפים מאכל אהוב
      const lean = ALL.find(f => f.id === LEANER[it.f.id]);
      if (!lean || !allowed(lean) || usedIds.has(lean.id)) return;
      const before = it.fat;
      it.f = lean; setMacros(it, lean, it.g);   // אותה כמות, מזון רזה יותר
      need -= (before - it.fat);
    });
    items.filter(it => it.isSaladGroup && it._oil && it._oilG > 0).forEach(sg => {
      if (need <= 0) return;
      const before = sg._oilG;
      sg._oilG = snapOil(before - need);
      need -= (before - sg._oilG); recalcSalad(sg);
    });
    items.filter(it => it.f && it.f.tags.includes('nuts') && it.g > 10).forEach(it => {
      if (need <= 0 || !it.f.f) return;
      const before = it.fat;
      reNuts(it, it.g - need / (it.f.f / 100));
      need -= (before - it.fat);
    });
    // החלפת חלבון שמן ברזה (משמר חלבון, חותך שומן) — רק אם עדיין מעל הסבולת
    if (need > S.fatG * FAT_TOL) {
      const prot = items.filter(it => it.f && !it.f.isEgg && !it.f.unitLabel && !S.liked.has(it.f.id) &&
        (it.f.tags.includes('meat') || it.f.tags.includes('fish')));   // לא מחליפים חלבון אהוב
      const fattest = prot.sort((a, b) => b.f.f - a.f.f)[0];
      if (fattest && fattest.f.f > 5) {
        const tag = fattest.f.tags.includes('fish') ? 'fish' : 'meat';
        const lean = ALL.filter(f => f.tags.includes(tag) && !f.tags.includes('tuna') &&
          allowed(f) && !usedIds.has(f.id) && f.f < fattest.f.f && f.p > 0)
          .sort((a, b) => a.f - b.f)[0];
        if (lean) { const protG = fattest.p; fattest.f = lean; reG(fattest, Math.round(protG / lean.p * 100)); }
      }
    }
  }
  meals.forEach(recalcMeal);
}

// יישור מאקרו ב-3 שלבים: (1) חלבון ±7% (2) שומן ±8% (3) פחמימות → קלוריות ±4%.
// פריטים בעלי "כמות טבעית" (פרוסה/בננה/קופסה/פריכייה) לא משתנים בשלב הקלוריות.
function reconcile(meals) {
  const items = () => meals.flatMap(m => m.items);
  const isCarb = it => it.f && !it.f.unitLabel &&
    (it.f.tags.includes('hot_carb') || it.f.tags.includes('grain') || it.f.tags.includes('starch'));
  const isProt = it => it.f && !it.isSaladGroup && !it.f.dip &&
    (it.f.isEgg || ((it.f.tags.includes('meat') || it.f.tags.includes('fish') || it.f.tags.includes('legume')) && !it.f.unitLabel));
  const clampG = (it, g) => {
    if (it.f.unitG) g = Math.round(g / it.f.unitG) * it.f.unitG;
    const max = Math.min(it.f.maxMeal || 99999, it.f.maxDay || 99999, 350);   // תקרת מנה לשפיות
    return Math.max(it.f.unitG || 30, Math.min(g, max));
  };

  for (let outer = 0; outer < 6; outer++) {
    // ── שלב 1: חלבון → ±10% ──
    const dP = meals.reduce((s, m) => s + m.totP, 0);
    if (Math.abs(dP - S.proteinG) > S.proteinG * PROT_TOL) {
      const pool = items().filter(isProt);
      const poolP = pool.reduce((s, it) => s + it.p, 0) || 1;
      const delta = S.proteinG - dP;
      pool.forEach(it => {
        const targetP = it.p + delta * (it.p / poolP);
        const targetG = it.f.p > 0 ? targetP / it.f.p * 100 : it.g;
        if (it.f.isEgg) adjustEgg(it, targetG);
        else reG(it, clampG(it, Math.round(targetG)));
      });
      meals.forEach(recalcMeal);
    }

    // ── שלב 2: שומן → ±8% (שמן → אגוזים → הוספה לנשנוש → החלפת חלבון שמן ברזה) ──
    adjustFat(meals);

    // ── שלב 3: קלוריות → ±4% ע"י פחמימות (וכמוצא אחרון גם חלבון) ──
    const dCal = meals.reduce((s, m) => s + m.totCal, 0);
    if (dCal >= S.target * (1 - CAL_TOL) && dCal <= S.target * (1 + CAL_TOL)) {
      const dP2 = meals.reduce((s, m) => s + m.totP, 0);
      const dF2 = meals.reduce((s, m) => s + m.totF, 0);
      if (Math.abs(dP2 - S.proteinG) <= S.proteinG * PROT_TOL &&
          Math.abs(dF2 - S.fatG)     <= S.fatG     * FAT_TOL) break;   // קלוריות+חלבון+שומן בטווח
      continue;
    }
    const delta = S.target - dCal, grow = delta > 0;
    // לחם פרוס (1–4 פרוסות) ופריכיות (2–6) הם מנופי פחמימה נוספים — חיוני כי בוקר/ערב
    // לרוב חסרי פחמימה-בגרמים, ובללא-גלוטן הפריכיות הן הפחמימה המרכזית.
    const isBread   = it => it.f && it.f.tags.includes('bread') && !it.f.tags.includes('cracker') && !it.f.pita && it.f.unitG;
    const isCracker = it => it.f && it.f.tags.includes('cracker') && it.f.unitG;
    const isUnitCarb = it => it.f && it.f.plural && it.f.unitG && it.f.tags.includes('starch');   // בטטה/תפו"א/תירס — 1–3 יחידות
    const isCount   = it => isBread(it) || isCracker(it) || isUnitCarb(it);
    const maxOf = it => isBread(it) ? it.f.unitG * 4 : isCracker(it) ? it.f.unitG * 6
      : isUnitCarb(it) ? Math.max(1, Math.min(3, Math.floor(450 / it.f.unitG))) * it.f.unitG
      : Math.min(it.f.maxMeal || 99999, it.f.maxDay || 99999, 450);
    const minOf = it => isCracker(it) ? it.f.unitG * 2 : (it.f.unitG || 30);
    const grams = items().filter(it => it.f && !it.f.isEgg && !it.f.condiment && !it.isSaladGroup &&
      it.f.id !== 20 && it.f.id !== 21 && (!it.f.unitLabel || isCount(it)));
    const hasRoom = arr => arr.some(it => grow ? it.g < maxOf(it) : it.g > minOf(it));
    // שלב הקלוריות נוגע *רק* בפחמימות (דגן/לחם/פריכיות). חלבון בבעלות שלב 1 בלבד —
    // כך לא מנפחים חלבון מעבר ליעד כדי למלא קלוריות. אם הפחמימות מוצו → מקבלים תת-השגה קלורית.
    const CARBCAP = 450;   // לדגן בגרמים מותר יותר (בולק אוכל הרבה); חלבון נשאר עד 350 (clampG)
    let pool = grams.filter(it => isCarb(it) || isCount(it));
    if (!pool.length || !hasRoom(pool)) break;
    const poolCal = pool.reduce((s, it) => s + it.cal, 0) || 1;
    pool.forEach(it => {
      const targetCal = it.cal + delta * (it.cal / poolCal);
      const targetG = targetCal / it.f.cal * 100;
      if (isBread(it))        reBread(it, Math.round(targetCal / (it.f.cal * it.f.unitG / 100)));
      else if (isCracker(it)) reCracker(it, targetG);
      else if (isUnitCarb(it)) reUnit(it, Math.round(targetCal / (it.f.cal * it.f.unitG / 100)));
      else { const cap = Math.min(it.f.maxMeal || 99999, it.f.maxDay || 99999, CARBCAP);
             reG(it, Math.max(it.f.unitG || 30, Math.min(Math.round(targetG), cap))); }
    });
    meals.forEach(recalcMeal);
  }

  // פתרון אי-היתכנות: אם הקלוריות עדיין גולשות מעל הסבולת (העדפות שמנות/חלבון דליל על יעד נמוך)
  // והפחמימות מוצו — מכווצים חלבון (מנה קטנה יותר, גם אהוב — לא החלפה) עד רצפת 1.6 ג/ק"ג.
  // אם עדיין גולש → אזהרה למשתמש שלא ניתן לבנות תפריט מדויק בתנאים אלה.
  let dCalF = meals.reduce((s, m) => s + m.totCal, 0);
  if (dCalF > S.target * (1 + CAL_TOL)) {
    const prot = meals.flatMap(m => m.items).filter(it => it.f && !it.f.isEgg && !it.f.unitLabel &&
      (it.f.tags.includes('meat') || it.f.tags.includes('fish') || it.f.tags.includes('legume')));
    const protCal = prot.reduce((s, it) => s + it.cal, 0);
    const shrinkP = prot.reduce((s, it) => s + it.p, 0);
    if (prot.length && protCal > 0) {
      const protFloor = S.proteinG * (S.diet.has('vegan') ? 1 : 0.8);   // ~1.6 ג/ק"ג
      const dP = meals.reduce((s, m) => s + m.totP, 0);
      const maxRemoveP = Math.max(0, dP - protFloor);
      const floorFactor = shrinkP > 0 ? Math.max(0, 1 - maxRemoveP / shrinkP) : 1;
      const factor = Math.max(1 - (dCalF - S.target) / protCal, floorFactor);   // לא מתחת לרצפת החלבון
      prot.forEach(it => reG(it, clampG(it, Math.round(it.g * factor))));
      meals.forEach(recalcMeal);
      dCalF = meals.reduce((s, m) => s + m.totCal, 0);
    }
    if (dCalF > S.target * (1 + CAL_TOL))
      S.menuWarning = 'עם ההעדפות והיעד הנוכחיים קשה לעמוד בדיוק ביעד הקלורי — חלק מהמאכלים שסומנו עשירים בשומן או דלים בחלבון. ניסינו לאזן; כדי לדייק כדאי להסיר חלק מהמאכלים השמנים המועדפים או להתאים מעט את יעד הקלוריות.';
  }
}

// ══════════════════════════════════════════
//  בניית תפריט מלא
// ══════════════════════════════════════════
// נוסח יחיד לאזהרת BMI — משמש גם בתפריט (buildMenu) וגם באזהרה החיה במסך 0 (ui.js)
function bmiWarnText() {
  const bmi = S.weight / (S.height / 100) ** 2;
  if (S.goal === 'cut' && bmi < 20)
    return `BMI שלך הוא ${bmi.toFixed(1)} — נמוך. חיטוב במשקל זה עלול לגרום לנזק בריאותי ולפגיעה במסת השריר. מומלץ לשקול שמירה או בניית מסה.`;
  if (S.goal === 'bulk' && bmi >= 30)
    return `BMI שלך הוא ${bmi.toFixed(1)} — גבוה. בתפריט מסה עם BMI כזה מומלץ להתייעץ עם תזונאי או רופא לפני שמתחילים.`;
  return null;
}

function buildMenu() {
  calcMacro();
  S.bmiWarning = bmiWarnText();

  S.menuWarning = null;
  const t = S.target;
  const key = (S.noTrain || !S.time) ? 'noTrain' : S.time;
  const mealDefs = mealPlan(key, t);
  const used = new Map();
  const ctx = { usedCarbCats: new Set() }; // גיוון קטגוריות פחמימה לאורך היום

  // בונים קודם את הארוחות הפחות-גמישות (לא-חמות, יחידות טבעיות), ואז את החמות (בשר+פחמימה
  // בגרמים) לפי התקציב שנותר — כך הגמישות מכוונת ישר ליעד היומי. הסדר לתצוגה נשמר.
  const meals = mealDefs.map(def => ({ ...def, budget: Math.round(t * def.pct), items: [] }));
  const buildInto = (m, budget) => { m.budget = budget; m.items = buildMealBest(m.type, budget, used, ctx); recalcMeal(m); };

  meals.filter(m => m.type !== 'hot').forEach(m => buildInto(m, m.budget));
  const hot = meals.filter(m => m.type === 'hot');
  const usedCal = meals.filter(m => m.type !== 'hot').reduce((s, m) => s + m.totCal, 0);
  const remaining = Math.max(0, t - usedCal);
  const hotPctSum = hot.reduce((s, m) => s + m.pct, 0) || 1;
  hot.forEach(m => buildInto(m, Math.round(remaining * m.pct / hotPctSum)));

  // ערובת פרי: אם לא נכנס אף פרי ליום והקלוריות מאפשרות — מוסיפים לנשנוש (או לאחרונה)
  const fruitIds = new Set(ALL.filter(f => f.tags.includes('fruit')).map(f => f.id));
  const hasFruit = [...used.keys()].some(id => fruitIds.has(id));
  if (!hasFruit && S.target > 1200) {
    const snackIdx = meals.findIndex(m => m.type === 'snack');
    const idx = snackIdx >= 0 ? snackIdx : meals.length - 1;
    const fr = pick(ALL.filter(f => f.tags.includes('fruit')), used, 120, 0, 250);
    if (fr) {
      use(used, fr);
      meals[idx].items.push(fr);
      recalcMeal(meals[idx]);
    }
  }

  reconcile(meals);   // יישור מאקרו ליעד
  return meals;
}

// תבנית ארוחות לפי זמן אימון + תוספת נשנושים ליעד קלורי גבוה (מסה) — כדי לפזר את התקציב
// על יותר ארוחות ולא לדחוס מנות ענק (מפתחי גוף אוכלים 5–6 ארוחות).
function mealPlan(key, target) {
  const defs = MEAL_TIMES[key].map(d => ({ ...d }));
  const extra = target > 3100 ? 3 : target > 2600 ? 2 : target > 2300 ? 1 : 0;
  const slots = [{ time: '10:30' }, { time: '16:00' }, { time: '21:30' }];
  for (let i = 0; i < extra; i++)
    defs.push({ label: 'נשנוש נוסף', icon: 'coffee', time: slots[i].time, pct: 0.13, tag: null, type: 'snack', big: false });
  defs.sort((a, b) => a.time.localeCompare(b.time));
  const sum = defs.reduce((s, d) => s + d.pct, 0) || 1;
  defs.forEach(d => d.pct /= sum);
  return defs;
}
