// מקליט את זרימת "אכלתי משהו אחר" כריל 9:16 (1080×1920) עם כיתובים צרובים — פוסט #5.
// הרצה: node record-alt-flow.mjs   →   alt-flow-reel/raw.webm → (ffmpeg, ראו README) alt-flow.mp4
import pw from 'file:///C:/Users/alexm/.claude/skills/web-to-reels/scripts/node_modules/playwright-core/index.js';
const { chromium } = pw;
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exe = 'C:/Users/alexm/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const outDir = path.join(__dirname, 'alt-flow-reel');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: exe });
// הויופורט = גודל ההקלטה (9:16); ffmpeg מגדיל ל-1080×1920.
const context = await browser.newContext({
  viewport: { width: 540, height: 960 },
  deviceScaleFactor: 2,
  recordVideo: { dir: outDir, size: { width: 540, height: 960 } },
});
const page = await context.newPage();

// כיתוב צרוב עליון (לא מתנגש עם כפתורי הפעולה למטה) + הסתרת פס גלילה + טבעת-טאפ
async function initFx() {
  await page.addStyleTag({ content: `
    ::-webkit-scrollbar{display:none}
    #reel-cap{position:fixed;left:50%;top:84px;transform:translateX(-50%);
      z-index:99999;max-width:90%;text-align:center;
      font-family:'Heebo',sans-serif;font-weight:800;font-size:26px;line-height:1.3;color:#fff;
      background:linear-gradient(135deg,#4f46e5,#7c3aed);
      padding:14px 24px;border-radius:18px;box-shadow:0 12px 34px rgba(40,46,90,.35);
      opacity:0;transition:opacity .45s ease;pointer-events:none}
    #reel-cap.show{opacity:1}
    .tap-ring{position:fixed;z-index:99998;width:22px;height:22px;border-radius:50%;
      border:4px solid #4f46e5;background:rgba(79,70,229,.25);pointer-events:none;
      animation:tapring .6s ease-out forwards}
    @keyframes tapring{from{transform:scale(.6);opacity:1}to{transform:scale(2.6);opacity:0}}
  ` });
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'reel-cap';
    document.body.appendChild(d);
  });
}
async function caption(text) {
  await page.evaluate((t) => {
    const d = document.getElementById('reel-cap');
    d.classList.remove('show');
    setTimeout(() => { d.textContent = t; d.classList.add('show'); }, 220);
  }, text);
  await page.waitForTimeout(420);
}
async function captionOff() {
  await page.evaluate(() => document.getElementById('reel-cap').classList.remove('show'));
  await page.waitForTimeout(280);
}
// טאפ נראה: טבעת מונפשת במרכז האלמנט, ואז קליק אמיתי
async function tap(selector) {
  await page.evaluate((sel) => {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ring = document.createElement('div');
    ring.className = 'tap-ring';
    ring.style.left = (r.left + r.width / 2 - 11) + 'px';
    ring.style.top = (r.top + r.height / 2 - 11) + 'px';
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 650);
  }, selector);
  await page.waitForTimeout(380);
  await page.evaluate((sel) => document.querySelector(sel)?.click(), selector);
}
async function smoothScrollTo(targetY, dur = 2500) {
  await page.evaluate(async ({ targetY, dur }) => {
    const startY = window.scrollY;
    const dist = targetY - startY;
    const t0 = performance.now();
    await new Promise((res) => {
      function step(now) {
        const p = Math.min(1, (now - t0) / dur);
        const e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        window.scrollTo(0, startY + dist * e);
        p < 1 ? requestAnimationFrame(step) : res();
      }
      requestAnimationFrame(step);
    });
  }, { targetY, dur });
}

await page.goto(pathToFileURL(path.join(__dirname, '..', '..', 'index.html')).href);
await page.waitForTimeout(900);

// דילוג על הדיסקליימר + פרופיל נעים + תפריט (יום דטרמיניסטי ויפה למסך)
await page.evaluate(() => {
  const ack = document.getElementById('disclaimer-ack');
  if (ack) { ack.checked = true; ack.dispatchEvent(new Event('change')); }
  try { closeDisclaimer(); } catch (e) {}
  localStorage.removeItem('shapeat-day');
  S.gender = 'male'; S.goal = 'maintain'; S.age = 30; S.height = 178; S.weight = 80;
  S.diet = new Set(); S.allergy = new Set(); S.liked = new Set(); S.avoided = new Set();
  S.time = 'noon'; S.noTrain = false; S.treats = [];
  renderMenu();
  window.scrollTo(0, 0);
});
await initFx();
await page.waitForTimeout(1300);

// ── 1: הוק על היום המסודר ──
await caption('יצא לך לאכול משהו שלא בתפריט? 🍕');
await page.waitForTimeout(2100);

// ── 2: גוללים לארוחה פתוחה ומדווחים ──
const btnY = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.alt-btn')].filter(b => !b.classList.contains('add-item-btn'));
  const target = btns[1] || btns[0];               // הארוחה השנייה — באמצע היום
  target.id = 'reel-alt-target';
  return target.getBoundingClientRect().top + window.scrollY - 430;
});
await smoothScrollTo(Math.max(0, btnY), 1700);
await caption('מדווחים בטאפ אחד');
await page.waitForTimeout(1200);
await tap('#reel-alt-target');
await page.waitForTimeout(500);
await captionOff();
await page.waitForTimeout(900);                    // הבורר פתוח — רואים את הרשימה

// ── 3: בוחרים פיצה (id 206) — קודם גוללים אליה בתוך הרשימה כדי שהטאפ ייראה ──
await page.evaluate(() =>
  document.querySelector('.picker-item[onclick="altFood(206)"]')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
await page.waitForTimeout(900);
await tap('.picker-item[onclick="altFood(206)"]');
await page.waitForTimeout(1100);                   // הפריט נכנס לסל, כפתור ההחלה מופיע

// ── 4: מחילים — היום נבנה מחדש ──
await tap('#alt-apply');
await page.waitForTimeout(1500);                   // בנייה מחדש + באנר ירוק
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
await caption('וההמשך מתאזן מעצמו ✓');
await page.waitForTimeout(2300);

// ── 5: מגלגלים על היום המעודכן ──
await caption('בלי עונש. בלי להתחיל מחדש.');
const dayH = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
await smoothScrollTo(Math.min(dayH, 1100), 3200);
await page.waitForTimeout(500);

// ── 6: נעילת מותג ──
await page.evaluate(() => {
  document.getElementById('reel-cap').classList.remove('show');
  const lock = document.createElement('div');
  lock.id = 'reel-lock';
  lock.style.cssText = `position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:14px;
    background:linear-gradient(135deg,#4f46e5,#7c3aed);opacity:0;transition:opacity .6s ease;
    font-family:'Heebo',sans-serif;color:#fff;text-align:center`;
  lock.innerHTML = `
    <div style="font-size:54px;font-weight:900;letter-spacing:-1px">Shap<span style="opacity:.85">Eat</span></div>
    <div style="font-size:23px;font-weight:700;opacity:.95">תפריט שחי איתך את היום האמיתי</div>
    <div style="font-size:19px;font-weight:800;background:#fff;color:#4f46e5;
      padding:11px 26px;border-radius:999px;margin-top:8px">לינק בביו · חינם לגמרי</div>`;
  document.body.appendChild(lock);
  requestAnimationFrame(() => { lock.style.opacity = '1'; });
});
await page.waitForTimeout(2600);

await context.close();
await browser.close();
const vid = fs.readdirSync(outDir).find(f => f.endsWith('.webm'));
console.log('raw video ->', path.join(outDir, vid));
