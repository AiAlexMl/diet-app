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
  const dCal  = meals.reduce((s, m) => s + m.totCal, 0);
  const dP    = Math.round(meals.reduce((s, m) => s + m.totP, 0));
  const dC    = Math.round(meals.reduce((s, m) => s + m.totC, 0));
  const dF    = Math.round(meals.reduce((s, m) => s + m.totF, 0));
  const dFib  = Math.round(meals.reduce((s, m) => s + (m.totFib || 0), 0));
  const pPct  = Math.round(dP * 4 / dCal * 100);
  const cPct  = Math.round(dC * 4 / dCal * 100);
  const fPct  = 100 - pPct - cPct;
  const gLabel = { cut:'חיטוב', maintain:'שמירה', bulk:'מסה' }[S.goal];
  const tLabel = S.noTrain || !S.time ? 'ללא אימון'
    : { morning:'אימון בוקר', noon:'אימון צהריים', evening:'אימון ערב' }[S.time];

  let html = `<div class="menu-header">
    <div class="menu-title">התפריט שלך — ${gLabel}</div>
    <div class="menu-sub">${tLabel}</div>
  </div>`;

  // אזהרת BMI
  if (S.bmiWarning) {
    html += `<div class="bmi-warning">
      <span class="bmi-warning-icon">⚠️</span>
      <span>${S.bmiWarning}</span>
    </div>`;
  }

  // אזהרת פחמימות נמוכות
  if (S.carbWarning) {
    html += `<div class="bmi-warning info-warning">
      <span class="bmi-warning-icon">ℹ️</span>
      <span>${S.carbWarning}</span>
    </div>`;
  }

  // אזהרת אי-התאמה: לא ניתן לעמוד ביעד הקלורי עם ההעדפות הנוכחיות
  if (S.menuWarning) {
    html += `<div class="bmi-warning info-warning">
      <span class="bmi-warning-icon">ℹ️</span>
      <span>${S.menuWarning}</span>
    </div>`;
  }

  // הערה לאימון בוקר
  if (S.time === 'morning') {
    html += `<div class="tips-box" style="margin-bottom:10px">
      אימון בוקר על קיבה ריקה — אם מרגישים צורך, בננה אחת או תמר לפני האימון יספיקו.
    </div>`;
  }

  meals.forEach(m => {
    const tagH = m.tag
      ? `<span class="meal-tag ${m.tag === 'pre' ? 'tag-pre' : 'tag-post'}">${m.tag === 'pre' ? 'לפני אימון' : 'אחרי אימון'}</span>`
      : '';

    html += `<div class="meal-card">
      <div class="meal-header">
        <div class="meal-title">${esc(m.label)} ${tagH}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="meal-time">${m.time}</span>
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
    <button class="btn-primary" onclick="renderMenu()">תפריט נוסף עם אותן העדפות ↻</button>
    <button class="btn-secondary" onclick="resetApp()">התחל מחדש (איפוס)</button>
  </div>`;

  document.getElementById('menu-output').innerHTML = html;
  goTo(4);
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

  goTo(0);
}
