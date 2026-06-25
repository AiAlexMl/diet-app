// ══════════════════════════════════════════
//  ui.js — ממשק משתמש: ניווט, רינדור, אירועים
//  גרסה 1.0 | Diet Application
// ══════════════════════════════════════════

let likeCat  = Object.keys(DB)[0];
let avoidCat = Object.keys(DB)[0];
const CATS   = Object.keys(DB);

// escape ל-HTML עבור כל טקסט שמוזרק ל-innerHTML. היום data.js סטטי, אבל ברגע ששמות
// (מוצר ממומן / מאמן) יגיעו ממסד נתונים — בלי זה יש XSS. לעטוף כל שדה דינמי.
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ══════════════════════════════════════════
//  שמירת מצב — רענון דף לא מאבד את ההעדפות (והבסיס ל-profiles של Supabase בהמשך)
// ══════════════════════════════════════════
const STATE_KEY = 'dietai-state';

function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      gender: S.gender, goal: S.goal, age: S.age, height: S.height, weight: S.weight,
      diet: [...S.diet], allergy: [...S.allergy], time: S.time, noTrain: S.noTrain,
      liked: [...S.liked], avoided: [...S.avoided],
    }));
  } catch (e) { /* localStorage חסום (מצב פרטי) — ממשיכים בלי שמירה */ }
}

function loadState() {
  let d;
  try { d = JSON.parse(localStorage.getItem(STATE_KEY)); } catch (e) { return; }
  if (!d) return;
  try {
    S.gender = d.gender === 'female' ? 'female' : 'male';
    S.goal   = ['cut', 'maintain', 'bulk'].includes(d.goal) ? d.goal : 'maintain';
    ['age', 'height', 'weight'].forEach(k => {
      if (d[k]) { S[k] = d[k]; document.getElementById(k).value = d[k]; }
    });
    S.diet    = new Set(d.diet || []);
    S.allergy = new Set(d.allergy || []);
    S.time    = d.time || null;
    S.liked   = new Set(d.liked || []);
    S.avoided = new Set(d.avoided || []);

    // סנכרון UI למצב המשוחזר
    document.getElementById('male-btn').classList.toggle('active', S.gender === 'male');
    document.getElementById('female-btn').classList.toggle('active', S.gender === 'female');
    ['cut', 'maintain', 'bulk'].forEach(x =>
      document.getElementById(x + '-btn').classList.toggle('active', S.goal === x));
    document.querySelectorAll('.chip').forEach(el => {
      const v = el.dataset.val;
      el.classList.toggle('active', S.diet.has(v));
      el.classList.toggle('active-danger', S.allergy.has(v));
    });
    if (d.noTrain) { S.noTrain = false; toggleNoTrain(); }   // toggleNoTrain מעדכן גם את ה-UI
    else if (S.time) {
      const card = document.querySelector(`.time-card[data-val="${S.time}"]`);
      if (card) setTime(card);
    }
    document.getElementById('like-count').textContent  = S.liked.size;
    document.getElementById('avoid-count').textContent = S.avoided.size;
  } catch (e) { /* מצב פגום — מתעלמים וממשיכים מאפס */ }
}

// ══════════════════════════════════════════
//  היום שלי — שמירת התפריט הנוכחי + סימוני "אכלתי" (הבסיס ללולאת השימוש היומית)
// ══════════════════════════════════════════
const DAY_KEY = 'shapeat-day';
let DAY = null;   // { date, target, meals(live), eaten[], warn{bmi,carb,menu}, gLabel, tLabel }

const FOOD_BY_ID = Object.fromEntries([...ALL, ...TREATS].map(f => [f.id, f]));
const todayStr = () => new Date().toISOString().slice(0, 10);

// פריט → נתונים שטוחים (בלי refs); משחזרים את f לפי id (תקף גם אחרי adjustEgg/lean-swap)
function serializeDay(day) {
  const item = it => it.isSaladGroup
    ? { salad: true, label: it.label, parts: it.parts, comps: it._comps.map(c => ({ id: c.f.id, g: c.g })),
        oilG: it._oilG || 0, cal: it.cal, p: it.p, c: it.c, fat: it.fat, fib: it.fib }
    : it.f && it.f.id === -1   // פריט ידני ("אכלתי משהו אחר" עם קלוריות בלבד)
    ? { manual: true, name: it.f.name, displayName: it.displayName,
        cal: it.cal, p: it.p, c: it.c, fat: it.fat, fib: it.fib }
    : { id: it.f.id, g: it.g, dispG: it.dispG, displayName: it.displayName,
        cal: it.cal, p: it.p, c: it.c, fat: it.fat, fib: it.fib };
  return {
    date: day.date, target: day.target, eaten: day.eaten, note: day.note || null,
    warn: day.warn, tips: day.tips || null, gLabel: day.gLabel, tLabel: day.tLabel, morningTip: day.morningTip,
    meals: day.meals.map(m => ({
      label: m.label, icon: m.icon, time: m.time, pct: m.pct, tag: m.tag, type: m.type, removed: m.removed || false, added: m.added || false,
      totCal: m.totCal, totP: m.totP, totC: m.totC, totF: m.totF, totFib: m.totFib,
      items: m.items.map(item),
    })),
  };
}

function deserializeDay(d) {
  const item = it => it.salad
    ? { isSaladGroup: true, label: it.label, parts: it.parts,
        _comps: it.comps.map(c => ({ f: FOOD_BY_ID[c.id], g: c.g })).filter(c => c.f),
        _oil: FOOD_BY_ID[86] || null, _oilG: it.oilG,
        cal: it.cal, p: it.p, c: it.c, fat: it.fat, fib: it.fib }
    : it.manual
    ? { f: { id: -1, name: it.name, prep: '', tags: [] }, g: 0, dispG: '', displayName: it.displayName,
        cal: it.cal, p: it.p, c: it.c, fat: it.fat, fib: it.fib }
    : { f: FOOD_BY_ID[it.id], g: it.g, dispG: it.dispG, displayName: it.displayName,
        cal: it.cal, p: it.p, c: it.c, fat: it.fat, fib: it.fib };
  return {
    date: d.date, target: d.target, eaten: d.eaten || [], note: d.note || null,
    warn: d.warn || {}, tips: d.tips || null, gLabel: d.gLabel, tLabel: d.tLabel, morningTip: d.morningTip,
    meals: d.meals.map(m => ({ ...m, items: m.items.map(item).filter(it => it.isSaladGroup || it.f) })),
  };
}

function saveDay() {
  if (!DAY) return;
  try { localStorage.setItem(DAY_KEY, JSON.stringify(serializeDay(DAY))); } catch (e) {}
}

function loadDay() {
  let d;
  try { d = JSON.parse(localStorage.getItem(DAY_KEY)); } catch (e) { return null; }
  if (!d || !d.meals) return null;
  try {
    const day = deserializeDay(d);
    if (day.date !== todayStr()) {           // יום חדש — חוזרים לתפריט הבסיס הנקי
      day.date = todayStr();
      // מסירים פינוקים, ארוחות שנוספו אגב איזון אמצע-יום ('added'/'נשנוש נוסף'), וארוחות שהוסרו —
      // כך מחר לא נגרר עם פינוקים של אתמול או נשנושים שצצו תוך כדי. הסימונים מתאפסים.
      day.meals = day.meals.filter(m =>
        m.type !== 'treat' && !m.added && m.label !== 'נשנוש נוסף' && !m.removed);
      day.eaten = day.meals.map(() => false);
      day.note = null;
    }
    // שחזור הפינוקים המתוכננים מתוך כרטיס הפינוק (כדי שהוספה/הסרה יעבדו אחרי רענון)
    const tm = day.meals.find(m => m.type === 'treat' && !m.removed);
    S.treats = tm ? tm.items.map(it => it.f && it.f.id).filter(id => id > 0) : [];
    return day;
  } catch (e) { return null; }
}

function clearDay() {
  DAY = null;
  try { localStorage.removeItem(DAY_KEY); } catch (e) {}
}

// ── סימון "אכלתי" — עדכון במקום (בלי רינדור מחדש, שומר מיקום גלילה) ──
// כל הארוחות הפעילות (לא-removed) סומנו כנאכלו
function dayComplete() {
  if (!DAY) return false;
  const active = DAY.meals.map((m, i) => ({ m, i })).filter(x => !x.m.removed);
  return active.length > 0 && active.every(x => DAY.eaten[x.i]);
}

// הנפשת קונפטי חוגגת בהשלמת היום. טהור CSS/JS, מכבד prefers-reduced-motion.
function celebrate() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#4f46e5', '#7c3aed', '#22c55e', '#f59e0b', '#ec4899'];
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  for (let k = 0; k < 44; k++) {
    const p = document.createElement('i');
    p.className = 'confetti-piece';
    p.style.left = (Math.random() * 100) + 'vw';
    p.style.background = colors[k % colors.length];
    p.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
    p.style.animationDuration = (1.8 + Math.random() * 1.2).toFixed(2) + 's';
    layer.appendChild(p);
  }
  const toast = document.createElement('div');
  toast.className = 'day-done-toast';
  toast.textContent = 'כל הכבוד! סיימת את היום 🎉';
  layer.appendChild(toast);
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3200);
}

function toggleEaten(i) {
  if (!DAY) return;
  const wasComplete = dayComplete();
  DAY.eaten[i] = !DAY.eaten[i];
  saveDay();
  const card = document.getElementById(`meal-card-${i}`);
  if (card) {
    card.classList.toggle('meal-eaten', DAY.eaten[i]);
    const btn = card.querySelector('.eaten-btn');
    if (btn) {
      btn.textContent = DAY.eaten[i] ? '✓ נאכלה' : 'אכלתי ✓';
      btn.classList.toggle('on', DAY.eaten[i]);
    }
    // ארוחה שנאכלה: יוצאים ממצב עריכה (ה-✏️ מוסתר ב-CSS, ה-✕ נעלמים)
    if (DAY.eaten[i]) {
      card.classList.remove('editing');
      const eb = card.querySelector('.meal-edit-btn');
      if (eb) eb.textContent = '✏️';
    }
  }
  updateDayProgress();
  if (!wasComplete && dayComplete()) celebrate();   // חגיגה רק במעבר ללא-שלם→שלם (לא בטעינת יום מושלם)
}

function updateDayProgress() {
  const box = document.getElementById('day-progress');
  if (!box || !DAY) return;
  const active = DAY.meals.map((m, i) => ({ m, i })).filter(x => !x.m.removed);
  // המכנה = סך קלוריות היום בפועל (כמו הסיכום למטה), לא היעד — כך אכילת הכל = 100% והמספרים זהים
  const totalCal = active.reduce((s, x) => s + x.m.totCal, 0);
  const eatenCal = active.reduce((s, x) => s + (DAY.eaten[x.i] ? x.m.totCal : 0), 0);
  const count = active.filter(x => DAY.eaten[x.i]).length;
  const pct = Math.min(100, Math.round(eatenCal / Math.max(totalCal, 1) * 100));
  box.innerHTML = `
    <div class="dp-row">
      <span>נאכלו ${count}/${active.length} ארוחות</span>
      <span><strong>${eatenCal.toLocaleString()}</strong> / ${totalCal.toLocaleString()} קק"ל</span>
    </div>
    <div class="dp-track"><div class="dp-fill" style="width:${pct}%"></div></div>`;
}

// ══════════════════════════════════════════
//  הסרת פריט בודד מארוחה (מצב עריכה per-meal)
// ══════════════════════════════════════════
// כפתור ✏️ בכותרת הארוחה חושף ✕ על השורות (CSS לפי .editing) — ברירת המחדל נקייה.
function toggleMealEdit(mi) {
  const card = document.getElementById(`meal-card-${mi}`);
  if (!card) return;
  const editing = card.classList.toggle('editing');
  const btn = card.querySelector('.meal-edit-btn');
  if (btn) btn.textContent = editing ? 'סיום' : '✏️';
}

// ✕ על פריט = "פשוט דלג": יורד מהארוחה ומהסיכום, שאר היום לא משתנה. הערה מציעה איזון אופציונלי.
function removeItem(mi, ii) {
  if (!DAY || !DAY.meals[mi]) return;
  const meal = DAY.meals[mi];
  meal.items.splice(ii, 1);
  if (!meal.items.length) meal.removed = true;
  recalcMeal(meal);
  if (meal.removed) {
    DAY.note = 'הסרת את כל פריטי הארוחה — היא ירדה מהיום. שאר הארוחות לא השתנו.';
    DAY.noteAction = null;
  } else {
    DAY.note = 'הסרת פריט שלא אכלת — הוא ירד מהתפריט ומהסיכום היומי. שאר הארוחות לא השתנו.';
    DAY.noteAction = { label: '⚖️ אזן את ההמשך', fn: 'balanceAfterRemoval', mi };
  }
  saveDay();
  renderDay();
}

// "אזן את ההמשך": נועל את הארוחה הערוכה (במה שנשאר בה — המשתמש אכל את השאר) ובונה מחדש
// רק את הארוחות שלא נגעו בהן. אם הארוחה רוקנה לגמרי — פשוט מאזנים את שאר היום.
function balanceAfterRemoval(mi) {
  if (!DAY) return;
  const meal = DAY.meals[mi];
  const res = (meal && meal.removed)
    ? rebalanceDay(DAY.meals, DAY.eaten)
    : rebuildRest(DAY.meals, DAY.eaten, mi, meal.items);
  DAY.note = (res.note && (res.note.includes('חצית') || res.note.includes('כמעט מלא')))
    ? res.note
    : 'איזנו את שאר היום סביב מה שכן תאכל ✓ — השינוי תקף להיום בלבד.';
  DAY.warn.menu = res.partialWarn || null;
  DAY.noteAction = null;
  saveDay();
  renderDay();
}

// ══════════════════════════════════════════
//  ניווט בין מסכים
// ══════════════════════════════════════════
function goTo(n) {
  updateMacroDisplay();
  document.querySelectorAll('.screen').forEach((s, i) => {
    s.classList.toggle('active', i === n);
    s.style.display = i === n ? 'block' : 'none';
  });
  document.querySelectorAll('.step').forEach((s, i) => {
    s.classList.toggle('done',   i < n);
    s.classList.toggle('active', i === n);
  });
  if (n === 1) updateTrainWarn();
  if (n === 2) renderGrid('like');
  if (n === 3) renderGrid('avoid');
  window.scrollTo(0, 0);
}

// הסתרת כל המסכים חוץ מהראשון בטעינה
document.querySelectorAll('.screen').forEach((s, i) => {
  s.style.display = i === 0 ? 'block' : 'none';
});

// ══════════════════════════════════════════
//  מסך 1 — פרטים אישיים
// ══════════════════════════════════════════
// לשון נקבה: כפתור "לא מתאמן" לפי מין + מצב הסימון
function noTrainLabel() {
  return gword('לא מתאמן כרגע', 'לא מתאמנת כרגע') + (S.noTrain ? ' ✓' : '');
}

// מחליף את כל הטקסט הסטטי המגדרי (אלמנטים עם data-m/data-f) לפי S.gender — דו-כיווני.
// נקרא מ-setGender (עדכון חי) ומ-init אחרי loadState (לפי המין המשוחזר).
function applyGender() {
  const f = S.gender === 'female';
  document.querySelectorAll('[data-m]').forEach(el => {
    el.textContent = f ? (el.dataset.f || el.dataset.m) : el.dataset.m;
  });
  const nb = document.getElementById('notrain-btn');
  if (nb) nb.textContent = noTrainLabel();
}

// לחיצת לוגו = בית. מציג את היום השמור אם קיים, אחרת מסך הפרטים. לא מאפס דבר.
function goHome() {
  if (DAY && DAY.meals && DAY.meals.length) renderDay();
  else goTo(0);
}

function setGender(g) {
  S.gender = g;
  document.getElementById('male-btn').classList.toggle('active',   g === 'male');
  document.getElementById('female-btn').classList.toggle('active', g === 'female');
  applyGender();
  updateMacroDisplay();
  saveState();
}

function setGoal(g) {
  S.goal = g;
  ['cut','maintain','bulk'].forEach(x => document.getElementById(x + '-btn').classList.remove('active'));
  document.getElementById(g + '-btn').classList.add('active');
  updateMacroDisplay();
  updateTrainWarn();   // מסה ↔ אזהרת מסה-בלי-אימון (מתעדכן אם המשתמש כבר סימן 'לא מתאמן')
  saveState();
}

// טווחים חוקיים לקלט (min/max של ה-HTML לא חוסמים הקלדה ידנית)
const NUM_LIMITS = { age: [18, 60, 28], height: [140, 220, 178], weight: [40, 200, 80] };   // גיל 18+ — אוכלוסיות רגישות (ראו ROADMAP, סעיף משפטי)
function readNum(id) {
  const [lo, hi, def] = NUM_LIMITS[id];
  const v = +document.getElementById(id).value;
  return v ? Math.min(hi, Math.max(lo, v)) : def;
}

// הודעת שגיאה לשדה מספרי אם הערך שהוקלד מחוץ לטווח (אחרת null). ריק = אין שגיאה.
// לגיל: מתחת ל-18 הודעה ייעודית (ללא 60); מעל 60 הודעת טווח.
function fieldError(id) {
  const [lo, hi] = NUM_LIMITS[id];
  const raw = document.getElementById(id).value.trim();
  if (raw === '') return null;
  const v = +raw;
  if (isFinite(v) && v >= lo && v <= hi) return null;
  if (id === 'age')    return v < lo ? 'האפליקציה מיועדת לגילאי 18 ומעלה.' : 'הגיל חייב להיות בין 18 ל-60.';
  if (id === 'height') return 'הגובה חייב להיות בין 140 ל-220 ס"מ.';
  return 'המשקל חייב להיות בין 40 ל-200 ק"ג.';
}
function inputErrors() {
  return ['age', 'height', 'weight'].map(fieldError).filter(Boolean);
}

function updateMacroDisplay() {
  S.age    = readNum('age');
  S.height = readNum('height');
  S.weight = readNum('weight');
  calcMacro();
  document.getElementById('bmr-disp').textContent    = S.bmr.toLocaleString();
  document.getElementById('rmr-disp').textContent    = S.rmr.toLocaleString();
  document.getElementById('target-disp').textContent = S.target.toLocaleString();
  document.getElementById('rmr-box').style.display   = 'flex';

  // כיתוב "אומדן ראשוני" — רק כשהמספר עוד יזוז: שמירה/מסה ולפני בחירת זמן אימון.
  // בחיטוב הגורם נשאר 1.2 גם אחרי אימון, ואחרי בחירת זמן/לא-מתאמן המספר כבר סופי — לכן מוסתר.
  const noteEl = document.getElementById('rmr-note');
  if (noteEl) noteEl.style.display =
    (S.goal !== 'cut' && !S.time && !S.noTrain) ? 'block' : 'none';

  const warn = bmiWarnText();
  const warnBox = document.getElementById('bmi-warn-box');
  warnBox.textContent = warn || '';
  warnBox.style.display = warn ? 'block' : 'none';

  // הודעות ולידציה לקלט (גיל/גובה/משקל מחוץ לטווח) — במקום החלפה שקטה
  const errs = inputErrors();
  const errBox = document.getElementById('input-error');
  if (errBox) {
    errBox.innerHTML = errs.map(esc).join('<br>');
    errBox.style.display = errs.length ? 'block' : 'none';
  }
}

['age','height','weight'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('input', () => { updateMacroDisplay(); saveState(); });
  // אין החלפה שקטה של ערך חורג — מוצגת הודעת שגיאה (inputErrors) והמעבר נחסם עד תיקון
});

// מעבר ממסך הפרטים: חוסם אם יש שדה מחוץ לטווח (גיל/גובה/משקל)
function goToFromDetails() {
  if (inputErrors().length) {
    updateMacroDisplay();
    const box = document.getElementById('input-error');
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  goTo(1);
}
loadState();          // שחזור העדפות מביקור קודם (אם יש)
applyGender();         // החלת לשון זכר/נקבה לפי המין המשוחזר
updateMacroDisplay();
DAY = loadDay();      // אם יש תפריט יום שמור — נכנסים ישר אליו ("מלווה יומי")
if (DAY) { renderDay(); }

// ══════════════════════════════════════════
//  מסך 2 — העדפות תזונה
// ══════════════════════════════════════════
function toggleDiet(el) {
  const v = el.dataset.val;
  S.diet.has(v) ? S.diet.delete(v) : S.diet.add(v);
  el.classList.toggle('active', S.diet.has(v));
  saveState();
}

function toggleAllergy(el) {
  const v = el.dataset.val;
  S.allergy.has(v) ? S.allergy.delete(v) : S.allergy.add(v);
  el.classList.toggle('active-danger', S.allergy.has(v));
  saveState();
}


// הערת "לא מתאמן" לפי מטרה: חיטוב — שמירת שריר; שמירה — עידוד לאימון; מסה — ריק (האזהרה האדומה היא המסר)
function noTrainNoteText() {
  return {
    cut: 'פעילות אנאירובית מומלצת לשמירת מסת שריר. אירובי יכול לזרז אך אינו חובה.',
    maintain: 'שווה לשלב אימוני כוח (אנאירובי) — הם בונים שריר ומעצבים את הגוף 💪',
    bulk: '',
  }[S.goal] || '';
}

// אזהרה חיה: מסה בלי אימון (מקור יחיד — trainWarnText ב-app.js) + רענון הערת ה"לא מתאמן" לפי מטרה
function updateTrainWarn() {
  const box = document.getElementById('train-warn');
  if (box) {
    const w = trainWarnText();
    box.textContent = w || '';
    box.style.display = w ? 'block' : 'none';
  }
  if (S.noTrain) {   // כשנבחר "לא מתאמן" — ההערה תלוית-מטרה (מתרעננת גם אם המטרה השתנתה)
    const n = document.getElementById('time-note');
    if (n) { const t = noTrainNoteText(); n.textContent = t; n.style.display = t ? 'block' : 'none'; }
  }
}

function setTime(el) {
  if (S.noTrain) {   // מעבר מ"לא מתאמן" לבחירת זמן — מבטלים אוטומטית את "לא מתאמן" (מעבר טבעי)
    S.noTrain = false;
    const nb = document.getElementById('notrain-btn');
    nb.textContent = noTrainLabel();
    nb.style.borderStyle = 'dashed';
  }
  document.querySelectorAll('.time-card').forEach(c => c.classList.remove('active'));
  S.time = el.dataset.val;
  el.classList.add('active');
  const notes = {
    morning: 'קיבה ריקה לאימון — אחרי האימון ארוחה גדולה.',
    noon:    'לפני האימון ארוחת צהריים גדולה, 3 שעות הפסקה, אחר כך אימון.',
    evening: 'ארוחה גדולה ב-17:30 לפני האימון, קלילה אחרי האימון.',
  };
  const n = document.getElementById('time-note');
  n.style.display = 'block';
  n.textContent = notes[S.time];
  updateTrainWarn();
  saveState();
}

function toggleNoTrain() {
  S.noTrain = !S.noTrain;
  const btn = document.getElementById('notrain-btn');
  btn.textContent   = noTrainLabel();
  btn.style.borderStyle = S.noTrain ? 'solid' : 'dashed';
  const n = document.getElementById('time-note');
  if (S.noTrain) {
    document.querySelectorAll('.time-card').forEach(c => c.classList.remove('active'));
    S.time = null;
    // הערת ה"לא מתאמן" (תלוית-מטרה) מוגדרת ב-updateTrainWarn למטה
  } else {
    n.style.display = 'none';
  }
  updateTrainWarn();
  saveState();
}

// ══════════════════════════════════════════
//  מסכים 3 + 4 — בחירת מאכלים
// ══════════════════════════════════════════
function renderGrid(mode) {
  const cat = mode === 'like' ? likeCat : avoidCat;
  const cls = mode === 'like' ? 'active-like' : 'active-avoid';
  const tabsEl = document.getElementById(mode + '-tabs');
  const gridEl = document.getElementById(mode + '-grid');

  tabsEl.innerHTML = CATS.map(c => {
    const count = DB[c].filter(f => mode === 'like' ? S.liked.has(f.id) : S.avoided.has(f.id)).length;
    const badge = count > 0 ? `<span class="tab-badge">${count}</span>` : '';
    return `<div class="cat-tab${c === cat ? ' ' + cls : ''}" onclick="selectCat('${mode}','${c}')">${c}${badge}</div>`;
  }).join('');

  gridEl.innerHTML = DB[cat].map(f => {
    const on = mode === 'like' ? S.liked.has(f.id) : S.avoided.has(f.id);
    return `<div class="food-card${on ? (mode === 'like' ? ' liked' : ' avoided') : ''}"
                 onclick="toggleFood('${mode}',${f.id})" id="${mode}-${f.id}">
      <div class="fc-icon">${mode === 'like' ? (on ? '❤️' : '🤍') : (on ? '🚫' : '✓')}</div>
      <div class="fc-name">${esc(f.name)}</div>
      ${f.prep ? `<div class="fc-prep">${esc(f.prep)}</div>` : ''}
    </div>`;
  }).join('');
}

function selectCat(mode, cat) {
  if (mode === 'like') likeCat = cat; else avoidCat = cat;
  renderGrid(mode);
}

function toggleFood(mode, id) {
  const set = mode === 'like' ? S.liked : S.avoided;
  set.has(id) ? set.delete(id) : set.add(id);
  document.getElementById(mode + '-count').textContent = set.size;
  const card = document.getElementById(`${mode}-${id}`);
  const on   = set.has(id);
  card.classList.toggle(mode === 'like' ? 'liked' : 'avoided', on);
  card.querySelector('.fc-icon').textContent =
    mode === 'like' ? (on ? '❤️' : '🤍') : (on ? '🚫' : '✓');
  updateTabBadges(mode);
  saveState();
}

function updateTabBadges(mode) {
  const cat = mode === 'like' ? likeCat : avoidCat;
  const cls = mode === 'like' ? 'active-like' : 'active-avoid';
  const tabs = document.getElementById(mode + '-tabs').querySelectorAll('.cat-tab');
  CATS.forEach((c, i) => {
    const tab = tabs[i];
    if (!tab) return;
    const count = DB[c].filter(f => mode === 'like' ? S.liked.has(f.id) : S.avoided.has(f.id)).length;
    const existing = tab.querySelector('.tab-badge');
    if (count > 0) {
      if (existing) existing.textContent = count;
      else tab.insertAdjacentHTML('beforeend', `<span class="tab-badge">${count}</span>`);
    } else if (existing) {
      existing.remove();
    }
  });
}

// ══════════════════════════════════════════
//  מסך 5 — רינדור תפריט
// ══════════════════════════════════════════
function renderMenu() {
  updateMacroDisplay();
  if (inputErrors().length) { goTo(0); updateMacroDisplay(); return; }   // קלט לא תקין — חזרה למסך הפרטים עם השגיאה
  if (!S.target) { alert('יש למלא פרטים אישיים'); goTo(0); return; }

  const meals = buildMenu();
  const treatMeal = meals.find(m => m.type === 'treat');
  DAY = {
    date: todayStr(), target: S.target,
    meals, eaten: meals.map(() => false),
    note: treatMeal ? treatBuildNote(treatMeal.items) : null,
    warn: { bmi: S.bmiWarning, train: S.trainWarning, carb: S.carbWarning, menu: S.menuWarning,
            calFloor: S.calFloorWarning },
    tips: dietTips(),
    gLabel: { cut: 'חיטוב', maintain: 'שמירה', bulk: 'מסה' }[S.goal],
    tLabel: S.noTrain || !S.time ? 'ללא אימון'
      : { morning: 'אימון בוקר', noon: 'אימון צהריים', evening: 'אימון ערב' }[S.time],
    morningTip: S.time === 'morning',
  };
  saveDay();
  renderDay();
}

// מציג את היום השמור (DAY) — נקרא גם אחרי בנייה וגם בשחזור מ-localStorage
function renderDay() {
  if (!DAY) return;
  const meals = DAY.meals;
  const dCal  = meals.reduce((s, m) => s + m.totCal, 0);
  const dP    = Math.round(meals.reduce((s, m) => s + m.totP, 0));
  const dC    = Math.round(meals.reduce((s, m) => s + m.totC, 0));
  const dF    = Math.round(meals.reduce((s, m) => s + m.totF, 0));
  const dFib  = Math.round(meals.reduce((s, m) => s + (m.totFib || 0), 0));
  const pPct  = Math.round(dP * 4 / Math.max(dCal, 1) * 100);
  const cPct  = Math.round(dC * 4 / Math.max(dCal, 1) * 100);
  const fPct  = 100 - pPct - cPct;

  let html = `<div class="menu-header">
    <div class="menu-title">התפריט שלך — ${esc(DAY.gLabel || '')}</div>
    <div class="menu-sub">${esc(DAY.tLabel || '')}</div>
  </div>
  <div class="day-progress" id="day-progress"></div>`;

  // כפתור פינוק: הוספה או הסרה (התפריט נבנה מחדש סביב הפינוק)
  const hasTreat = meals.some(m => m.type === 'treat' && !m.removed);
  html += `<div class="treat-bar">` +
    `<button class="btn-treat" onclick="openTreatPicker()">🍫 ${hasTreat ? 'עוד פינוק' : 'בא לי פינוק היום'}</button>` +
    (hasTreat ? `<button class="btn-treat on" onclick="removeTreat()">✕ הסר פינוקים</button>` : '') +
    `</div>`;

  // אזהרת BMI
  if (DAY.warn.bmi) {
    html += `<div class="bmi-warning">
      <span class="bmi-warning-icon">⚠️</span>
      <span>${esc(DAY.warn.bmi)}</span>
    </div>`;
  }

  // אזהרה חריפה: מסה בלי אימון
  if (DAY.warn.train) {
    html += `<div class="field-error">
      <span class="bmi-warning-icon">⚠️</span>
      <span>${esc(DAY.warn.train)}</span>
    </div>`;
  }

  // אזהרת פחמימות נמוכות
  if (DAY.warn.carb) {
    html += `<div class="bmi-warning info-warning">
      <span class="bmi-warning-icon">ℹ️</span>
      <span>${esc(DAY.warn.carb)}</span>
    </div>`;
  }

  // אזהרת אי-התאמה: לא ניתן לעמוד ביעד הקלורי עם ההעדפות הנוכחיות
  if (DAY.warn.menu) {
    html += `<div class="bmi-warning info-warning">
      <span class="bmi-warning-icon">ℹ️</span>
      <span>${esc(DAY.warn.menu)}</span>
    </div>`;
  }

  // הערת שקיפות: היעד הועלה לרצפה הקלורית הבריאה
  if (DAY.warn.calFloor) {
    html += `<div class="bmi-warning info-warning">
      <span class="bmi-warning-icon">ℹ️</span>
      <span>${esc(DAY.warn.calFloor)}</span>
    </div>`;
  }

  // הודעת היום (תיקון יום: "כמעט מלא" / "חצית את היעד") + פעולה אופציונלית (אזן אחרי הסרה)
  if (DAY.note) {
    html += `<div class="day-note">${esc(DAY.note)}` +
      (DAY.noteAction ? ` <button class="note-action" onclick="${DAY.noteAction.fn}(${DAY.noteAction.mi})">${esc(DAY.noteAction.label)}</button>` : '') +
      `</div>`;
  }

  // הערה לאימון בוקר
  if (DAY.morningTip) {
    html += `<div class="tips-box" style="margin-bottom:10px">
      אימון בוקר על קיבה ריקה — אם מרגישים צורך, בננה אחת או תמר לפני האימון יספיקו.
    </div>`;
  }

  meals.forEach((m, mi) => {
    if (m.removed) return;   // ארוחה שהוסרה בתיקון יום (חצה את היעד)
    const tagH = m.tag
      ? `<span class="meal-tag ${m.tag === 'pre' ? 'tag-pre' : 'tag-post'}">${m.tag === 'pre' ? 'לפני אימון' : 'אחרי אימון'}</span>`
      : '';

    html += `<div class="meal-card${DAY.eaten[mi] ? ' meal-eaten' : ''}${m.type === 'treat' ? ' treat-card' : ''}" id="meal-card-${mi}">
      <div class="meal-header">
        <div class="meal-title">${m.type === 'treat' ? '🍫 ' : ''}${esc(m.label)} ${tagH}</div>
        <div style="display:flex;align-items:center;gap:8px">
          ${m.type === 'treat' ? `<span class="meal-time">מתי שמתחשק 🙂</span>` : m.time ? `<span class="meal-time">${m.time}</span>` : ''}
          <span class="meal-cal">${m.totCal} קל׳</span>
          ${m.type !== 'treat' ? `<button class="meal-edit-btn" onclick="toggleMealEdit(${mi})" title="ערוך ארוחה">✏️</button>` : ''}
        </div>
      </div>`;
    // למתאמנים: עדיף להרחיק את הפינוק מחלון האימון (תגי לפני/אחרי אימון שמורים לארוחות עצמן)
    if (m.type === 'treat' && m.totCal > 0 && DAY.tLabel && DAY.tLabel !== 'ללא אימון') {
      html += `<div class="treat-tip">💡 טיפ: הארוחות שלפני ואחרי האימון בנויות בדיוק בשבילו (פחמימה + חלבון) — את הפינוק עדיף לשמור רחוק מחלון האימון, לא במקומן.</div>`;
    }

    if (m.items.length === 0) {
      html += `<div class="empty-meal-note">לא נמצאו מזונות מתאימים לארוחה זו. נסה להסיר חלק מהמאכלים המוחרגים.</div>`;
    }

    m.items.forEach((it, ii) => {
      const rm = m.type === 'treat'
        ? `<button class="treat-remove" onclick="removeTreatItem(${ii})" title="הסר פינוק">✕</button>`
        : `<button class="item-remove" onclick="removeItem(${mi},${ii})" title="הסר פריט">✕</button>`;
      if (it.isSaladGroup) {
        html += `<div class="salad-row">
          <div class="salad-header">
            <span class="food-row-name">${rm}${esc(it.label)}</span>
            <div class="food-row-right">
              <span class="food-row-cal">${it.cal} קל׳</span>
            </div>
          </div>
          <div class="salad-items">${it.parts.map(esc).join(' + ')}</div>
        </div>`;
      } else {
        const rowName = (() => {
          if (it.displayName) return it.displayName;
          if (!it.f.prep) return it.f.name;
          const firstWord = it.f.prep.split(/[\s\/]/)[0];
          return it.f.name.includes(firstWord) ? it.f.name : `${it.f.name} ${it.f.prep}`;
        })();
        const imgSrc = it.f.img || `images/${it.f.id}.jpg`;
        const thumb = `<span class="food-thumb"><img src="${esc(imgSrc)}" alt="${esc(it.f.name)}" loading="lazy" onerror="this.parentElement.style.display='none'"></span>`;
        html += `<div class="food-row">
          <span class="food-row-name">${rm}${thumb}${esc(rowName)}</span>
          <div class="food-row-right">
            ${it.dispG ? `<span class="food-row-amount">${esc(it.dispG)}</span>` : ''}
            <span class="food-row-cal">${it.cal} קל׳</span>
          </div>
        </div>`;
      }
    });

    html += `<div class="macro-row">
      <div class="macro-pill"><div class="val">${m.totP}g</div><div class="lbl">חלבון</div></div>
      <div class="macro-pill"><div class="val">${m.totC}g</div><div class="lbl">פחמימות</div></div>
      <div class="macro-pill"><div class="val">${m.totF}g</div><div class="lbl">שומן</div></div>
    </div>
    <div class="meal-actions">
      ${m.type !== 'treat' ? `<button class="alt-btn" onclick="openAltPicker(${mi})">🔄 אכלתי משהו אחר</button>` : ''}
      <button class="eaten-btn${DAY.eaten[mi] ? ' on' : ''}" onclick="toggleEaten(${mi})">${DAY.eaten[mi] ? '✓ נאכלה' : 'אכלתי ✓'}</button>
    </div></div>`;
  });

  html += `<div class="summary-card">
    <div class="summary-title">סיכום יומי</div>
    <div class="summary-grid">
      <div class="sum-metric"><div class="val">${dCal.toLocaleString()}</div><div class="lbl">קלוריות</div></div>
      <div class="sum-metric"><div class="val">${dP}g</div><div class="lbl">חלבון</div></div>
      <div class="sum-metric"><div class="val">${dC}g</div><div class="lbl">פחמימות</div></div>
      <div class="sum-metric"><div class="val">${dF}g</div><div class="lbl">שומן</div></div>
    </div>
    <div class="bar-row">
      <span class="bar-lbl">חלבון</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pPct}%;background:#378ADD"></div></div>
      <span style="font-size:12px;color:var(--text-tert);width:30px">${pPct}%</span>
    </div>
    <div class="bar-row">
      <span class="bar-lbl">פחמימות</span>
      <div class="bar-track"><div class="bar-fill" style="width:${cPct}%;background:#1D9E75"></div></div>
      <span style="font-size:12px;color:var(--text-tert);width:30px">${cPct}%</span>
    </div>
    <div class="bar-row">
      <span class="bar-lbl">שומן</span>
      <div class="bar-track"><div class="bar-fill" style="width:${fPct}%;background:#EF9F27"></div></div>
      <span style="font-size:12px;color:var(--text-tert);width:30px">${fPct}%</span>
    </div>
    <div class="fiber-row">
      <span>סיבים תזונתיים</span>
      <span><strong>${dFib}g</strong></span>
    </div>
    <div class="tips-box" style="margin-top:12px">
      פעילות אנאירובית מומלצת לשמירת מסת שריר. אירובי יכול לזרז את התהליך אך אינו חובה.
    </div>
  </div>`;

  // טיפים קלילים (B12 לטבעוני, מים לכולם)
  if (DAY.tips && DAY.tips.length) {
    html += `<div class="tips-box" style="margin-top:12px">${DAY.tips.map(esc).join('<br>')}</div>`;
  }

  html += `
  <div class="nav-btns" style="margin-top:12px">
    <button class="btn-primary" onclick="if (confirmRebuild()) renderMenu()">תפריט נוסף עם אותן העדפות ↻</button>
    <button class="btn-secondary" onclick="window.print()">📄 שמירת התפריט</button>
    <button class="btn-secondary" onclick="resetApp()">התחל מחדש (איפוס)</button>
  </div>
  <div class="coach-cta" style="text-align:center;margin-top:18px;font-size:13px;color:#8b8fa3">
    <a href="coaches.html" style="color:#4f46e5;text-decoration:none;font-weight:600">מאמן/ה?</a>
    יש לך גרסה משלך — ממותגת בשמך, למתאמנים שלך ←
  </div>`;

  document.getElementById('menu-output').innerHTML = html;
  updateDayProgress();
  goTo(4);
}

// ══════════════════════════════════════════
//  בורר פינוקים — התפריט נבנה מחדש סביב הפינוק שנבחר
// ══════════════════════════════════════════
// אם כבר סומנו ארוחות היום — בנייה מחדש תאפס אותן; מבקשים אישור
function confirmRebuild() {
  if (DAY && DAY.eaten && DAY.eaten.some(Boolean))
    return confirm('בניית תפריט חדש תאפס את סימוני "אכלתי" של היום. להמשיך?');
  return true;
}

function openTreatPicker() {
  closeTreatPicker();
  const ov = document.createElement('div');
  ov.className = 'picker-overlay';
  ov.id = 'treat-picker';
  ov.innerHTML = `<div class="picker-box">
    <div class="picker-title">מה בא לך היום? 🍫</div>
    <div class="picker-sub">התפריט ייבנה מחדש כך שהפינוק נכנס ביעד היומי</div>
    <div class="picker-list">` + TREATS.map(tr =>
      `<div class="picker-item" onclick="chooseTreat(${tr.id})">
        <span>${esc(tr.name)} <small>(${esc(tr.unitLabel)})</small></span>
        <span class="picker-cal">${Math.round(tr.cal * tr.unitG / 100)} קק"ל</span>
      </div>`).join('') + `</div>
    <button class="btn-secondary picker-cancel" onclick="closeTreatPicker()">ביטול</button>
  </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) closeTreatPicker(); });
  document.body.appendChild(ov);
}

function closeTreatPicker() {
  const el = document.getElementById('treat-picker');
  if (el) el.remove();
}

// נוסח הערת הפינוק בבנייה: אפס-קלוריות = "על חשבון הבית"; אחרת ההסבר הרגיל (סכום הקלוריות לכמה פינוקים)
function treatBuildNote(items) {
  if (!items || !items.length) return null;
  const tCal = items.reduce((s, it) => s + it.cal, 0);
  if (tCal === 0) return '🥤 על חשבון הבית — בלי קלוריות, בלי השפעה על התפריט. תיהנה!';
  const name = items.length === 1 ? items[0].f.name : `${items.length} פינוקים`;
  return `התפריט נבנה סביב הפינוק שביקשת ✓ — ${name} (${tCal} קק"ל) הוקצה מתוך היעד היומי, ושאר הארוחות הותאמו בהתאם.`;
}

// הודעת ה-rebalance: שומרים את הודעות המדרגות (כמעט מלא / חצית), אחרת נוסח פינוק ייעודי
function treatNote(res, fallback) {
  return res.note && (res.note.includes('חצית') || res.note.includes('כמעט מלא')) ? res.note : fallback;
}

function chooseTreat(id) {
  closeTreatPicker();
  const tf = FOOD_BY_ID[id];
  if (!tf) return;
  if (!S.treats) S.treats = [];

  // באמצע יום (כבר סומנו ארוחות): לא מאפסים כלום — מוסיפים לכרטיס הפינוק ומעדכנים רק את ההמשך
  if (DAY && DAY.eaten.some(Boolean)) {
    S.treats.push(id);
    const it = mkItem(tf, tf.unitG);
    let ti = DAY.meals.findIndex(m => m.type === 'treat' && !m.removed);
    if (ti >= 0) {
      DAY.meals[ti].items.push(it);
      recalcMeal(DAY.meals[ti]);
    } else {
      const tm = { label: 'פינוק', icon: 'gift', time: '', pct: 0, tag: null, type: 'treat', big: false, items: [it], removed: false };
      recalcMeal(tm);
      DAY.meals.push(tm);
      DAY.eaten.push(false);
    }
    const res = rebalanceDay(DAY.meals, DAY.eaten);
    DAY.note = treatNote(res, it.cal === 0
      ? 'הפינוק נוסף — בלי קלוריות, בלי השפעה על היום ✓'
      : 'הפינוק נוסף והמשך היום עודכן סביבו ✓ — השינוי תקף להיום בלבד.');
    DAY.warn.menu = res.partialWarn || null;
    saveDay();
    renderDay();
    return;
  }

  S.treats.push(id);
  renderMenu();   // אין סימונים — בנייה מלאה סביב הפינוקים (אין מה לאפס)
}

function removeTreat() {
  const ti = DAY ? DAY.meals.findIndex(m => m.type === 'treat' && !m.removed) : -1;

  // באמצע יום: מסירים את כרטיס הפינוק (אם טרם נאכל) ומעדכנים את ההמשך
  if (DAY && DAY.eaten.some(Boolean) && ti >= 0 && !DAY.eaten[ti]) {
    DAY.meals[ti].removed = true;
    DAY.meals[ti].items = [];
    recalcMeal(DAY.meals[ti]);
    S.treats = [];
    const res = rebalanceDay(DAY.meals, DAY.eaten);
    DAY.note = treatNote(res, 'הפינוקים הוסרו וההמשך עודכן ✓');
    DAY.warn.menu = res.partialWarn || null;
    saveDay();
    renderDay();
    return;
  }

  if (!confirmRebuild()) return;
  S.treats = [];
  renderMenu();
}

// הסרת פינוק בודד מתוך כרטיס הפינוק (משחרר תקציב → מאזן מחדש את ההמשך, בניגוד להסרת פריט רגיל)
function removeTreatItem(idx) {
  if (!DAY) return;
  const ti = DAY.meals.findIndex(m => m.type === 'treat' && !m.removed);
  if (ti < 0) return;
  const meal = DAY.meals[ti];
  meal.items.splice(idx, 1);
  if (S.treats) S.treats.splice(idx, 1);
  if (!meal.items.length) meal.removed = true;
  recalcMeal(meal);
  const res = rebalanceDay(DAY.meals, DAY.eaten);
  DAY.note = treatNote(res, 'הפינוק הוסר וההמשך עודכן ✓');
  DAY.warn.menu = res.partialWarn || null;
  saveDay();
  renderDay();
}

// ══════════════════════════════════════════
//  "אכלתי משהו אחר" — דיווח אכילה חריגה ובנייה מחדש של המשך היום
// ══════════════════════════════════════════
let altIdx = null;
let altCart = [];   // הפריטים שנאכלו בפועל — אפשר כמה (שווארמה + קולה...)

function altFoodRows(query) {
  const q = (query || '').trim();
  return ALL.filter(f => !q || f.name.includes(q)).map(f =>
    `<div class="picker-item" onclick="altFood(${f.id})">
      <span>${esc(f.name)} <small>(${f.unitG ? esc(f.unitLabel || f.unitG + 'g') : '100g'})</small></span>
      <span class="picker-cal">${Math.round(f.cal * (f.unitG || 100) / 100)} קק"ל</span>
    </div>`).join('') || `<div class="picker-sub">לא נמצא — נסה את הטאב הידני</div>`;
}

function openAltPicker(mi) {
  closeAltPicker();
  altIdx = mi;
  altCart = [];
  const ov = document.createElement('div');
  ov.className = 'picker-overlay';
  ov.id = 'alt-picker';
  ov.innerHTML = `<div class="picker-box">
    <div class="picker-title">מה אכלת בפועל? 🔄</div>
    <div class="picker-sub">הוסף פריט אחד או יותר — ונבנה מחדש את המשך היום סביבם</div>
    <div class="picker-tabs">
      <button class="ptab active" onclick="altTab(this, 'alt-treats')">פינוקים</button>
      <button class="ptab" onclick="altTab(this, 'alt-foods')">מהמאגר</button>
      <button class="ptab" onclick="altTab(this, 'alt-manual')">ידני</button>
    </div>
    <div id="alt-treats" class="picker-list">` + TREATS.map(tr =>
      `<div class="picker-item" onclick="altFood(${tr.id})">
        <span>${esc(tr.name)} <small>(${esc(tr.unitLabel)})</small></span>
        <span class="picker-cal">${Math.round(tr.cal * tr.unitG / 100)} קק"ל</span>
      </div>`).join('') + `</div>
    <div id="alt-foods" class="picker-pane" style="display:none">
      <input id="alt-search" class="picker-input" placeholder="חיפוש מאכל..." oninput="document.getElementById('alt-food-list').innerHTML = altFoodRows(this.value)">
      <input id="alt-grams" class="picker-input" type="number" min="10" placeholder="כמות בגרמים (ריק = מנה רגילה)">
      <div id="alt-food-list" class="picker-list">${altFoodRows('')}</div>
    </div>
    <div id="alt-manual" class="picker-pane" style="display:none">
      <input id="alt-name" class="picker-input" placeholder="מה אכלת? (למשל: בורקס)">
      <input id="alt-cal" class="picker-input" type="number" min="0" placeholder="כמה קלוריות בערך?">
      <button class="btn-secondary" style="width:100%" onclick="altManual()">+ הוסף לרשימה</button>
      <div class="picker-sub" style="margin-top:8px">לא בטוח? הערכה גסה מספיקה.</div>
    </div>
    <div id="alt-cart" class="alt-cart"></div>
    <button id="alt-apply" class="btn-primary picker-cancel" style="display:none" onclick="applyAltCart()"></button>
    <button class="btn-secondary picker-cancel" onclick="closeAltPicker()">ביטול</button>
  </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) closeAltPicker(); });
  document.body.appendChild(ov);
}

function altTab(btn, paneId) {
  document.querySelectorAll('#alt-picker .ptab').forEach(b => b.classList.toggle('active', b === btn));
  ['alt-treats', 'alt-foods', 'alt-manual'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === paneId ? '' : 'none';
  });
}

function closeAltPicker() {
  const el = document.getElementById('alt-picker');
  if (el) el.remove();
  altIdx = null;
  altCart = [];
}

function renderAltCart() {
  const box = document.getElementById('alt-cart');
  const apply = document.getElementById('alt-apply');
  if (!box || !apply) return;
  if (!altCart.length) {
    box.innerHTML = '';
    apply.style.display = 'none';
    return;
  }
  const total = altCart.reduce((s, it) => s + it.cal, 0);
  box.innerHTML = altCart.map((it, i) =>
    `<div class="alt-cart-row">
      <span>${esc(it.displayName || it.f.name)}${it.dispG ? ` <small>(${esc(it.dispG)})</small>` : ''}</span>
      <span>${it.cal} קק"ל <button class="cart-x" onclick="removeAltItem(${i})">✕</button></span>
    </div>`).join('') +
    `<div class="alt-cart-row alt-cart-total"><span>סה"כ</span><span>${total} קק"ל</span></div>`;
  apply.style.display = '';
  apply.textContent = `עדכן ובנה מחדש את ההמשך (${altCart.length})`;
}

function removeAltItem(i) {
  altCart.splice(i, 1);
  renderAltCart();
}

function altFood(id) {
  const f = FOOD_BY_ID[id];
  if (!f) return;
  const gIn = document.getElementById('alt-grams');
  const g = (gIn && parseInt(gIn.value)) || f.unitG || 100;
  altCart.push(mkItem(f, g));
  renderAltCart();
}

function altManual() {
  const nameEl = document.getElementById('alt-name');
  const calEl = document.getElementById('alt-cal');
  const name = (nameEl.value || '').trim() || 'ארוחה מחוץ לתפריט';
  const cal = parseFloat(calEl.value);
  if (isNaN(cal) || cal < 0) { alert('יש להזין הערכת קלוריות'); return; }
  altCart.push(manualItem(name, cal));
  nameEl.value = ''; calEl.value = '';
  renderAltCart();
}

function applyAltCart() {
  if (!altCart.length || altIdx === null || !DAY) return;
  const mi = altIdx;
  const items = altCart.slice();
  closeAltPicker();
  const res = rebuildRest(DAY.meals, DAY.eaten, mi, items);
  DAY.note = res.note;
  DAY.warn.menu = res.partialWarn || null;
  saveDay();
  renderDay();
}

// ══════════════════════════════════════════
//  חלון ויתור
// ══════════════════════════════════════════
function closeDisclaimer() {
  const ack = document.getElementById('disclaimer-ack');
  if (ack && !ack.checked) return;   // הצהרה אקטיבית — לא סוגרים בלי אישור
  document.getElementById('disclaimer-overlay').style.display = 'none';
}

// ══════════════════════════════════════════
//  איפוס מלא לתפריט חדש
// ══════════════════════════════════════════
function resetApp() {
  S.liked.clear();
  S.avoided.clear();
  S.diet.clear();
  S.allergy.clear();
  S.time   = null;
  S.noTrain = false;
  S.goal   = 'maintain';
  S.treats = [];

  document.querySelectorAll('.chip').forEach(el => el.classList.remove('active', 'active-danger'));
  ['cut','maintain','bulk'].forEach(x => document.getElementById(x + '-btn').classList.remove('active'));
  document.getElementById('maintain-btn').classList.add('active');
  document.querySelectorAll('.time-card').forEach(c => c.classList.remove('active'));
  const noTrainBtn = document.getElementById('notrain-btn');
  noTrainBtn.textContent   = noTrainLabel();
  noTrainBtn.style.borderStyle = 'dashed';
  document.getElementById('time-note').style.display = 'none';
  document.getElementById('like-count').textContent  = '0';
  document.getElementById('avoid-count').textContent = '0';
  try { localStorage.removeItem(STATE_KEY); } catch (e) {}
  clearDay();

  goTo(0);
}
