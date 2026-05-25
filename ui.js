// ══════════════════════════════════════════
//  ui.js — ממשק משתמש: ניווט, רינדור, אירועים
//  גרסה 1.0 | Diat Application
// ══════════════════════════════════════════

let likeCat  = Object.keys(DB)[0];
let avoidCat = Object.keys(DB)[0];
const CATS   = Object.keys(DB);

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
}

function setGoal(g) {
  S.goal = g;
  ['cut','maintain','bulk'].forEach(x => document.getElementById(x + '-btn').classList.remove('active'));
  document.getElementById(g + '-btn').classList.add('active');
  updateMacroDisplay();
}

function updateMacroDisplay() {
  S.age    = +document.getElementById('age').value    || 28;
  S.height = +document.getElementById('height').value || 178;
  S.weight = +document.getElementById('weight').value || 80;
  calcMacro();
  document.getElementById('bmr-disp').textContent    = S.bmr.toLocaleString();
  document.getElementById('rmr-disp').textContent    = S.rmr.toLocaleString();
  document.getElementById('target-disp').textContent = S.target.toLocaleString();
  document.getElementById('rmr-box').style.display   = 'flex';
}

['age','height','weight'].forEach(id =>
  document.getElementById(id).addEventListener('input', updateMacroDisplay)
);
updateMacroDisplay();

// ══════════════════════════════════════════
//  מסך 2 — העדפות תזונה
// ══════════════════════════════════════════
function toggleDiet(el) {
  const v = el.dataset.val;
  S.diet.has(v) ? S.diet.delete(v) : S.diet.add(v);
  el.classList.toggle('active', S.diet.has(v));
}

function toggleAllergy(el) {
  const v = el.dataset.val;
  S.allergy.has(v) ? S.allergy.delete(v) : S.allergy.add(v);
  el.classList.toggle('active-danger', S.allergy.has(v));
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
}

// ══════════════════════════════════════════
//  מסכים 3 + 4 — בחירת מאכלים
// ══════════════════════════════════════════
function renderGrid(mode) {
  const cat = mode === 'like' ? likeCat : avoidCat;
  const cls = mode === 'like' ? 'active-like' : 'active-avoid';
  const tabsEl = document.getElementById(mode + '-tabs');
  const gridEl = document.getElementById(mode + '-grid');

  tabsEl.innerHTML = CATS.map(c =>
    `<div class="cat-tab${c === cat ? ' ' + cls : ''}" onclick="selectCat('${mode}','${c}')">${c}</div>`
  ).join('');

  gridEl.innerHTML = DB[cat].map(f => {
    const on = mode === 'like' ? S.liked.has(f.id) : S.avoided.has(f.id);
    return `<div class="food-card${on ? (mode === 'like' ? ' liked' : ' avoided') : ''}"
                 onclick="toggleFood('${mode}',${f.id})" id="${mode}-${f.id}">
      <div class="fc-icon">${mode === 'like' ? (on ? '❤️' : '🤍') : (on ? '🚫' : '✓')}</div>
      <div class="fc-name">${f.name}</div>
      ${f.prep ? `<div class="fc-prep">${f.prep}</div>` : ''}
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

  // אזהרת BMI נמוך
  if (S.bmiWarning) {
    html += `<div class="bmi-warning">
      <span class="bmi-warning-icon">⚠️</span>
      <span>${S.bmiWarning}</span>
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
        <div class="meal-title">${m.label} ${tagH}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="meal-time">${m.time}</span>
          <span class="meal-cal">${m.totCal} קל׳</span>
        </div>
      </div>`;

    m.items.forEach(it => {
      if (it.isSaladGroup) {
        html += `<div class="salad-row">
          <div class="salad-header">
            <span class="food-row-name">${it.label}</span>
            <div class="food-row-right">
              <span class="food-row-cal">${it.cal} קל׳</span>
            </div>
          </div>
          <div class="salad-items">${it.parts.join(' + ')}</div>
        </div>`;
      } else {
        const rowName = (() => {
          if (it.displayName) return it.displayName;
          if (!it.f.prep) return it.f.name;
          const firstWord = it.f.prep.split(/[\s\/]/)[0];
          return it.f.name.includes(firstWord) ? it.f.name : `${it.f.name} ${it.f.prep}`;
        })();
        html += `<div class="food-row">
          <span class="food-row-name">${rowName}</span>
          <div class="food-row-right">
            ${it.dispG ? `<span class="food-row-amount">${it.dispG}</span>` : ''}
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
    <div class="tips-box" style="margin-top:12px">
      פעילות אנאירובית מומלצת לשמירת מסת שריר. אירובי יכול לזרז את התהליך אך אינו חובה.
    </div>
  </div>
  <div class="nav-btns" style="margin-top:12px">
    <button class="btn-primary" onclick="goTo(0)">בנה תפריט חדש ←</button>
  </div>`;

  document.getElementById('menu-output').innerHTML = html;
  goTo(4);
}
