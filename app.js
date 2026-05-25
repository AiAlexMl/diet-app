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
};

// ── ALL foods flat array (מאוחד מ-DB) ──
const ALL = Object.values(DB).flat();

// ══════════════════════════════════════════
//  חישובי מאקרו — Harris-Benedict 1919 × 1.2
// ══════════════════════════════════════════
function calcMacro() {
  const bmr = S.gender === 'male'
    ? 66.5 + 13.75 * S.weight + 5.003 * S.height - 6.755 * S.age
    : 655.1 + 9.563 * S.weight + 1.85  * S.height - 4.676 * S.age;

  S.bmr    = Math.round(bmr);
  S.rmr    = Math.round(bmr * 1.2);
  S.target = S.goal === 'cut'  ? S.rmr - 500
           : S.goal === 'bulk' ? S.rmr + 300
           : S.rmr;

  // חלבון — לפי BMI, רצפה לנשים על שומן
  const bmi = S.weight / (S.height / 100) ** 2;
  const pw  = bmi >= 30 ? 25 * (S.height / 100) ** 2 : S.weight;
  S.proteinG = Math.round(Math.min(S.weight, pw) * 2);
  S.fatG     = Math.max(S.gender === 'female' ? 40 : 25,
                        Math.round(S.target * 0.2 / 9));
  S.carbG    = Math.max(0, Math.round((S.target - S.proteinG * 4 - S.fatG * 9) / 4));
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
  return true;
}

// ══════════════════════════════════════════
//  כמויות חכמות
// ══════════════════════════════════════════
function eggDisplay(g) {
  const n = Math.max(1, Math.min(2, Math.round(g / 60)));
  return { label: n === 1 ? 'חביתה מביצה אחת' : 'חביתה משתי ביצים', g: n * 60 };
}

function cottagePortion(targetG) {
  return targetG >= 200
    ? { g: 250, dispG: 'קופסה (250g)' }
    : { g: 125, dispG: 'חצי קופסה (125g)' };
}

function crackerPortion(targetG) {
  const n = Math.max(2, Math.min(6, Math.round(targetG / 9)));
  return { g: n * 9, dispG: `${n} פריכיות (${n * 9}g)` };
}

function mkItem(f, g) {
  let dispG, displayName;
  if (f.isEgg) {
    const e = eggDisplay(g); g = e.g;
    displayName = e.label;   // "חביתה מביצה אחת" / "חביתה משתי ביצים"
    dispG = '';
  } else if ((f.id === 20 || f.id === 21) && f.halfLabel) {
    const c = cottagePortion(g); g = c.g; dispG = c.dispG;
  } else if (f.tags.includes('cracker')) {
    const c = crackerPortion(g); g = c.g; dispG = c.dispG;
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
  };
}

// ══════════════════════════════════════════
//  בחירת מזון — מועדפים ראשונה, ללא חזרות
// ══════════════════════════════════════════
function pick(pool, used, calT, protT, maxG) {
  const sorted = [
    ...pool.filter(f => S.liked.has(f.id) && allowed(f) && !used.has(f.id)),
    ...pool.filter(f => !S.liked.has(f.id) && allowed(f) && !used.has(f.id)),
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
    ...arr.filter(f => S.liked.has(f.id)),
    ...arr.filter(f => !S.liked.has(f.id)),
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

  const v1 = regular[0];
  const v2 = regular[1];
  // ירק שלישי אופציונלי: ירק salad_only (חסה/כרוב) או ירק רגיל שלישי
  const v3 = extras[0] || regular[2] || null;

  const g1 = v1.unitG || 120;
  const g2 = v2.unitG || 100;
  const g3 = v3 ? (v3.unitG || 80) : 0;

  // שמן זית — חובה בסלט (אם מותר לפי העדפות)
  const oil = ALL.find(f => f.id === 86);
  const hasOil = oil && allowed(oil);
  const oilG = hasOil ? 14 : 0;

  const saladCal =
    Math.round(v1.cal * g1 / 100) +
    Math.round(v2.cal * g2 / 100) +
    (v3 ? Math.round(v3.cal * g3 / 100) : 0) +
    (hasOil ? Math.round(oil.cal * oilG / 100) : 0);

  // שם + כמות לכל פריט — "פלפל אדום (חצי פלפל)" / "עגבנייה בינונית"
  const fmtPart = (f, g) => {
    const label = f.unitLabel || `${g}g`;
    return f.name.includes(' ') ? `${f.name} (${label})` : label;
  };
  const parts = [fmtPart(v1, g1), fmtPart(v2, g2)];
  if (v3) parts.push(fmtPart(v3, g3));
  if (hasOil) parts.push('כף שמן זית');

  use(used, { f: v1, g: g1 });
  use(used, { f: v2, g: g2 });
  if (v3) use(used, { f: v3, g: g3 });
  if (hasOil && oil) use(used, { f: oil, g: oilG });

  return {
    isSaladGroup: true, label: 'סלט ירק', parts,
    cal: saladCal,
    p:   Math.round((v1.p*g1/100 + v2.p*g2/100 + (v3 ? v3.p*g3/100 : 0)) * 10) / 10,
    c:   Math.round((v1.c*g1/100 + v2.c*g2/100 + (v3 ? v3.c*g3/100 : 0)) * 10) / 10,
    fat: Math.round((v1.f*g1/100 + v2.f*g2/100 + (v3 ? v3.f*g3/100 : 0) + (hasOil ? oil.f*oilG/100 : 0)) * 10) / 10,
  };
}

function buildSingleVeg(used, hotOk) {
  const tag = hotOk ? 'hot_veg' : 'salad';
  const pool = ALL.filter(f =>
    f.tags.includes(tag) && allowed(f) && !used.has(f.id) && !f.tags.includes('salad_only')
  );
  const sorted = [...pool.filter(f => S.liked.has(f.id)), ...pool.filter(f => !S.liked.has(f.id))];
  if (!sorted.length) return null;
  const f = sorted[0], g = f.unitG || 100;
  use(used, { f, g });
  return mkItem(f, g);
}

// ══════════════════════════════════════════
//  בניית ארוחות לפי סוג
// ══════════════════════════════════════════
function buildBreakfast(cal, used) {
  const items = [];
  const protShare = S.proteinG * cal / S.target;
  const eggDairy = ALL.filter(f => f.tags.includes('egg') || f.tags.includes('dairy'));
  const p = pick(eggDairy, used, cal * 0.5, protShare * 0.85, 300);
  if (p) { items.push(p); use(used, p); }
  const bkCarb = ALL.filter(f => f.tags.includes('breakfast') || f.tags.includes('bread') || f.tags.includes('cracker'));
  const cr = pick(bkCarb, used, cal * 0.35, 0, 200);
  if (cr) { items.push(cr); use(used, cr); }
  const sal = buildSalad(used);
  if (sal) {
    items.push(sal);
    if (p && p.f.isEgg) {
      const idx = items.findIndex(x => x.f && x.f.id === p.f.id);
      if (idx >= 0) items[idx] = { ...items[idx], dispG: items[idx].dispG + ' עם סלט בצד' };
    }
  } else {
    const sv = buildSingleVeg(used, false);
    if (sv) items.push(sv);
  }
  return items;
}

function buildHotMeal(cal, used, addHotVeg, usedCarbCats) {
  const items = [];
  const protShare = S.proteinG * cal / S.target;
  const hotMeat = ALL.filter(f => (f.tags.includes('meat') || f.tags.includes('fish')) && !f.tags.includes('tuna'));
  const m = pick(hotMeat, used, cal * 0.45, protShare * 0.9, 300);
  if (m) { items.push(m); use(used, m); }

  // גיוון פחמימות: קטגוריה שלא שימשה עוד ביום תקבל עדיפות
  const getCarbCat = f => f.tags.find(t => t === 'grain' || t === 'starch') || 'other';
  const allHc = ALL.filter(f => f.tags.includes('hot_carb'));
  const prefHc = allHc.filter(f => !usedCarbCats.has(getCarbCat(f)));
  const hcPool = prefHc.length ? [...prefHc, ...allHc.filter(f => usedCarbCats.has(getCarbCat(f)))] : allHc;
  const c = pick(hcPool, used, cal * 0.4, 0, 250);
  if (c) { usedCarbCats.add(getCarbCat(c.f)); items.push(c); use(used, c); }
  const sal = buildSalad(used);
  if (sal) {
    items.push(sal);
  } else if (addHotVeg) {
    const hv = ALL.filter(f => f.tags.includes('hot_veg'));
    const hvi = pick(hv, used, cal * 0.1, 0, 200);
    if (hvi) { items.push(hvi); use(used, hvi); }
  } else {
    const sv = buildSingleVeg(used, true);
    if (sv) items.push(sv);
  }
  return items;
}

function buildTunaMeal(cal, used) {
  const items = [];
  const protShare = S.proteinG * cal / S.target;
  const tuna = ALL.filter(f => f.tags.includes('tuna'));
  const t = pick(tuna, used, cal * 0.4, protShare * 0.8, 160);
  if (t) { items.push(t); use(used, t); }
  const bread = ALL.filter(f => f.tags.includes('bread') || f.tags.includes('cracker'));
  const b = pick(bread, used, cal * 0.3, 0, 130);
  if (b) { items.push(b); use(used, b); }
  const sal = buildSalad(used);
  if (sal) items.push(sal);
  else { const sv = buildSingleVeg(used, false); if (sv) items.push(sv); }
  return items;
}

function buildDinner(cal, used) {
  const items = [];
  const protShare = S.proteinG * cal / S.target;
  const cold = ALL.filter(f => f.tags.includes('tuna') || f.tags.includes('dairy') || f.tags.includes('egg'));
  const p = pick(cold, used, cal * 0.5, protShare * 0.7, 250);
  if (p) { items.push(p); use(used, p); }
  const sal = buildSalad(used);
  if (sal) {
    items.push(sal);
    if (p && p.f.isEgg) {
      const idx = items.findIndex(x => x.f && x.f.id === p.f.id);
      if (idx >= 0) items[idx] = { ...items[idx], dispG: items[idx].dispG + ' עם סלט בצד' };
    }
  } else {
    const sv = buildSingleVeg(used, false);
    if (sv) items.push(sv);
  }
  if (cal > 280) {
    const bread = ALL.filter(f => f.tags.includes('bread') || f.tags.includes('cracker'));
    const b = pick(bread, used, cal * 0.2, 0, 80);
    if (b) { items.push(b); use(used, b); }
  }
  return items;
}

function buildSnack(cal, used) {
  const items = [];
  const d = ALL.filter(f => f.tags.includes('dairy') || f.tags.includes('supplement'));
  const p = pick(d, used, cal * 0.65, S.proteinG * cal / S.target, 200);
  if (p) { items.push(p); use(used, p); }
  const fr = pick(ALL.filter(f => f.tags.includes('fruit')), used, cal * 0.35, 0, 250);
  if (fr) { items.push(fr); use(used, fr); }
  else {
    const cr = pick(ALL.filter(f => f.tags.includes('cracker')), used, cal * 0.3, 0, 54);
    if (cr) { items.push(cr); use(used, cr); }
  }
  return items;
}

// ══════════════════════════════════════════
//  בניית תפריט מלא
// ══════════════════════════════════════════
function buildMenu() {
  calcMacro();

  // אזהרת BMI נמוך מדי לחיטוב
  const bmi = S.weight / (S.height / 100) ** 2;
  S.bmiWarning = (S.goal === 'cut' && bmi < 20)
    ? `BMI שלך הוא ${bmi.toFixed(1)} — נמוך מאוד. בנתונים אלה חיטוב עלול לפגוע במסת השריר. מומלץ לשקול תהליך בניית מסה במקום.`
    : null;

  const t = S.target;
  const key = (S.noTrain || !S.time) ? 'noTrain' : S.time;
  const mealDefs = MEAL_TIMES[key];
  const used = new Map();
  const hotCount = { n: 0 };
  const usedCarbCats = new Set(); // עוקב אחרי קטגוריות פחמימה שכבר שימשו (grain / starch)

  const meals = mealDefs.map(def => {
    const budget = Math.round(t * def.pct);
    let items;
    if (def.type === 'breakfast') {
      items = buildBreakfast(budget, used);
    } else if (def.type === 'hot') {
      const useTuna = hotCount.n > 0 && Math.random() > 0.65;
      items = useTuna ? buildTunaMeal(budget, used) : buildHotMeal(budget, used, hotCount.n > 0, usedCarbCats);
      hotCount.n++;
    } else if (def.type === 'snack') {
      items = buildSnack(budget, used);
    } else {
      items = buildDinner(budget, used);
    }
    const totCal = items.reduce((s, x) => s + x.cal, 0);
    const totP   = Math.round(items.reduce((s, x) => s + (x.p   || 0), 0) * 10) / 10;
    const totC   = Math.round(items.reduce((s, x) => s + (x.c   || 0), 0) * 10) / 10;
    const totF   = Math.round(items.reduce((s, x) => s + (x.fat || 0), 0) * 10) / 10;
    return { ...def, budget, items, totCal, totP, totC, totF };
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
    }
  }

  return meals;
}
