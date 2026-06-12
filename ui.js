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
    warn: day.warn, gLabel: day.gLabel, tLabel: day.tLabel, morningTip: day.morningTip,
    meals: day.meals.map(m => ({
      label: m.label, icon: m.icon, time: m.time, pct: m.pct, tag: m.tag, type: m.type, removed: m.removed || false,
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
    warn: d.warn || {}, gLabel: d.gLabel, tLabel: d.tLabel, morningTip: d.morningTip,
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
    if (day.date !== todayStr()) {           // יום חדש — אותו תפריט, סימונים מתאפסים
      day.date = todayStr();
      day.eaten = day.meals.map(() => false);
    }
    return day;
  } catch (e) { return null; }
}

function clearDay() {
  DAY = null;
  try { localStorage.removeItem(DAY_KEY); } catch (e) {}
}

// ── סימון "אכלתי" — עדכון במקום (בלי רינדור מחדש, שומר מיקום גלילה) ──
function toggleEaten(i) {
  if (!DAY) return;
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
  }
  updateDayProgress();
}

function updateDayProgress() {
  const box = document.getElementById('day-progress');
  if (!box || !DAY) return;
  const active = DAY.meals.map((m, i) => ({ m, i })).filter(x => !x.m.removed);
  const eatenCal = active.reduce((s, x) => s + (DAY.eaten[x.i] ? x.m.totCal : 0), 0);
  const count = active.filter(x => DAY.eaten[x.i]).length;
  const pct = Math.min(100, Math.round(eatenCal / Math.max(DAY.target, 1) * 100));
  box.innerHTML = `
    <div class="dp-row">
      <span>נאכלו ${count}/${active.length} ארוחות</span>
      <span><strong>${eatenCal.toLocaleString()}</strong> / ${DAY.target.toLocaleString()} קק"ל</span>
    </div>
    <div class="dp-track"><div class="dp-fill" style="width:${pct}%"></div></div>`;
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
function setGender(g) {
  S.gender = g;
  document.getElementById('male-btn').classList.toggle('active',   g === 'male');
  document.getElementById('female-btn').classList.toggle('active', g === 'female');
  updateMacroDisplay();
  saveState();
}

function setGoal(g) {
  S.goal = g;
  ['cut','maintain','bulk'].forEach(x => document.getElementById(x + '-btn').classList.remove('active'));
  document.getElementById(g + '-btn').classList.add('active');
  updateMacroDisplay();
  saveState();
}

// טווחים חוקיים לקלט (min/max של ה-HTML לא חוסמים הקלדה ידנית)
const NUM_LIMITS = { age: [18, 60, 28], height: [140, 220, 178], weight: [40, 200, 80] };   // גיל 18+ — אוכלוסיות רגישות (ראו ROADMAP, סעיף משפטי)
function readNum(id) {
  const [lo, hi, def] = NUM_LIMITS[id];
  const v = +document.getElementById(id).value;
  return v ? Math.min(hi, Math.max(lo, v)) : def;
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

  const warn = bmiWarnText();
  const warnBox = document.getElementById('bmi-warn-box');
  warnBox.textContent = warn || '';
  warnBox.style.display = warn ? 'block' : 'none';
}

['age','height','weight'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('input', () => { updateMacroDisplay(); saveState(); });
  el.addEventListener('change', () => { el.value = readNum(id); });   // החזרת ערך חורג לטווח בסיום ההקלדה
});
loadState();          // שחזור העדפות מביקור קודם (אם יש)
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

function setTime(el) {
  if (S.noTrain) return;
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
  saveState();
}

function toggleNoTrain() {
  S.noTrain = !S.noTrain;
  const btn = document.getElementById('notrain-btn');
  btn.textContent   = S.noTrain ? 'לא מתאמן כרגע ✓' : 'לא מתאמן כרגע';
  btn.style.borderStyle = S.noTrain ? 'solid' : 'dashed';
  const n = document.getElementById('time-note');
  if (S.noTrain) {
    document.querySelectorAll('.time-card').forEach(c => c.classList.remove('active'));
    S.time = null;
    n.style.display = 'block';
    n.textContent = 'פעילות אנאירובית מומלצת לשמירת מסת שריר. אירובי יכול לזרז אך אינו חובה.';
  } else {
    n.style.display = 'none';
  }
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
  if (!S.target) { alert('יש למלא פרטים אישיים'); goTo(0); return; }

  const meals = buildMenu();
  const treatMeal = meals.find(m => m.type === 'treat');
  DAY = {
    date: todayStr(), target: S.target,
    meals, eaten: meals.map(() => false),
    note: treatMeal && treatMeal.items[0]
      ? `התפריט נבנה סביב הפינוק שביקשת ✓ — ${treatMeal.items[0].f.name} (${treatMeal.totCal} קק"ל) הוקצה מתוך היעד היומי, ושאר הארוחות הותאמו בהתאם.`
      : null,
    warn: { bmi: S.bmiWarning, carb: S.carbWarning, menu: S.menuWarning },
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
  const hasTreat = meals.some(m => m.type === 'treat');
  html += `<div class="treat-bar">` + (hasTreat
    ? `<button class="btn-treat on" onclick="removeTreat()">✕ הסר את הפינוק</button>`
    : `<button class="btn-treat" onclick="openTreatPicker()">🍫 בא לי פינוק היום</button>`) + `</div>`;

  // אזהרת BMI
  if (DAY.warn.bmi) {
    html += `<div class="bmi-warning">
      <span class="bmi-warning-icon">⚠️</span>
      <span>${esc(DAY.warn.bmi)}</span>
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

  // הודעת היום (תיקון יום: "כמעט מלא" / "חצית את היעד")
  if (DAY.note) {
    html += `<div class="day-note">${esc(DAY.note)}</div>`;
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
          ${m.time ? `<span class="meal-time">${m.time}</span>` : ''}
          <span class="meal-cal">${m.totCal} קל׳</span>
        </div>
      </div>`;

    if (m.items.length === 0) {
      html += `<div class="empty-meal-note">לא נמצאו מזונות מתאימים לארוחה זו. נסה להסיר חלק מהמאכלים המוחרגים.</div>`;
    }

    m.items.forEach(it => {
      if (it.isSaladGroup) {
        html += `<div class="salad-row">
          <div class="salad-header">
            <span class="food-row-name">${esc(it.label)}</span>
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
          <span class="food-row-name">${thumb}${esc(rowName)}</span>
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
  </div>
  <div class="nav-btns" style="margin-top:12px">
    <button class="btn-primary" onclick="if (confirmRebuild()) renderMenu()">תפריט נוסף עם אותן העדפות ↻</button>
    <button class="btn-secondary" onclick="resetApp()">התחל מחדש (איפוס)</button>
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

// הודעת ה-rebalance: שומרים את הודעות המדרגות (כמעט מלא / חצית), אחרת נוסח פינוק ייעודי
function treatNote(res, fallback) {
  return res.note && (res.note.includes('חצית') || res.note.includes('כמעט מלא')) ? res.note : fallback;
}

function chooseTreat(id) {
  closeTreatPicker();
  const tf = FOOD_BY_ID[id];

  // באמצע יום (כבר סומנו ארוחות): לא מאפסים כלום — מוסיפים כרטיס פינוק ומעדכנים רק את ההמשך
  if (DAY && DAY.eaten.some(Boolean) && tf) {
    const tm = { label: 'פינוק', icon: 'gift', time: '', pct: 0, tag: null, type: 'treat', big: false, items: [mkItem(tf, tf.unitG)], removed: false };
    recalcMeal(tm);
    DAY.meals.push(tm);
    DAY.eaten.push(false);
    const res = rebalanceDay(DAY.meals, DAY.eaten);
    DAY.note = treatNote(res, 'הפינוק נוסף והמשך היום עודכן סביבו ✓ — השינוי תקף להיום בלבד.');
    DAY.warn.menu = res.partialWarn || null;
    saveDay();
    renderDay();
    return;
  }

  S.treat = id;
  renderMenu();   // אין סימונים — בנייה מלאה סביב הפינוק (אין מה לאפס)
}

function removeTreat() {
  const ti = DAY ? DAY.meals.findIndex(m => m.type === 'treat' && !m.removed) : -1;

  // באמצע יום: מסירים רק את כרטיס הפינוק (אם טרם נאכל) ומעדכנים את ההמשך
  if (DAY && DAY.eaten.some(Boolean) && ti >= 0 && !DAY.eaten[ti]) {
    DAY.meals[ti].removed = true;
    DAY.meals[ti].items = [];
    recalcMeal(DAY.meals[ti]);
    const res = rebalanceDay(DAY.meals, DAY.eaten);
    DAY.note = treatNote(res, 'הפינוק הוסר וההמשך עודכן ✓');
    DAY.warn.menu = res.partialWarn || null;
    S.treat = null;
    saveDay();
    renderDay();
    return;
  }

  if (!confirmRebuild()) return;
  S.treat = null;
  renderMenu();
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

  document.querySelectorAll('.chip').forEach(el => el.classList.remove('active', 'active-danger'));
  ['cut','maintain','bulk'].forEach(x => document.getElementById(x + '-btn').classList.remove('active'));
  document.getElementById('maintain-btn').classList.add('active');
  document.querySelectorAll('.time-card').forEach(c => c.classList.remove('active'));
  const noTrainBtn = document.getElementById('notrain-btn');
  noTrainBtn.textContent   = 'לא מתאמן כרגע';
  noTrainBtn.style.borderStyle = 'dashed';
  document.getElementById('time-note').style.display = 'none';
  document.getElementById('like-count').textContent  = '0';
  document.getElementById('avoid-count').textContent = '0';
  try { localStorage.removeItem(STATE_KEY); } catch (e) {}
  clearDay();

  goTo(0);
}
