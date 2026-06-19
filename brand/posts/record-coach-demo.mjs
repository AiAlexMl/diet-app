// מקליט את coach-demo.html כסרטון דמו 4:5 (נייד) עם כיתובים צרובים. נכס מערכתי: DM/וואטסאפ/דף נחיתה/IG.
// הרצה: node record-coach-demo.mjs   →   coach-demo-video/raw.webm → (ffmpeg) coach-demo.mp4
import pw from 'file:///C:/Users/alexm/.claude/skills/web-to-reels/scripts/node_modules/playwright-core/index.js';
const { chromium } = pw;
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exe = 'C:/Users/alexm/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const outDir = path.join(__dirname, 'coach-demo-video');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: exe });
// הויופורט = גודל ההקלטה (אחרת recordVideo מרפד באפור במקום למתוח); ffmpeg מגדיל ל-1080x1350.
const context = await browser.newContext({
  viewport: { width: 540, height: 675 },
  deviceScaleFactor: 2,
  recordVideo: { dir: outDir, size: { width: 540, height: 675 } },
});
const page = await context.newPage();

// שכבת כיתוב צרובה (RTL, פיל גרדיאנט מותג)
async function initCaption() {
  await page.addStyleTag({ content: `
    #demo-cap{position:fixed;left:50%;bottom:40px;transform:translateX(-50%);
      z-index:99999;max-width:88%;text-align:center;
      font-family:'Heebo',sans-serif;font-weight:800;font-size:27px;line-height:1.3;color:#fff;
      background:linear-gradient(135deg,#4f46e5,#7c3aed);
      padding:16px 26px;border-radius:20px;box-shadow:0 12px 34px rgba(40,46,90,.35);
      opacity:0;transition:opacity .45s ease}
    #demo-cap.show{opacity:1}
  ` });
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'demo-cap';
    document.body.appendChild(d);
  });
}
async function caption(text) {
  await page.evaluate((t) => {
    const d = document.getElementById('demo-cap');
    d.classList.remove('show');
    setTimeout(() => { d.textContent = t; d.classList.add('show'); }, 250);
  }, text);
  await page.waitForTimeout(450);
}
async function smoothScrollTo(targetY, dur = 5000) {
  await page.evaluate(async ({ targetY, dur }) => {
    const startY = window.scrollY;
    const dist = targetY - startY;
    const t0 = performance.now();
    await new Promise((res) => {
      function step(now) {
        const p = Math.min(1, (now - t0) / dur);
        const e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
        window.scrollTo(0, startY + dist * e);
        p < 1 ? requestAnimationFrame(step) : res();
      }
      requestAnimationFrame(step);
    });
  }, { targetY, dur });
}

// קצב: ברירת מחדל ~21ש' (הנבחר) · --short ~18ש' · --full ~26ש'
const MODE = process.argv.includes('--short') ? 'short' : process.argv.includes('--full') ? 'full' : 'mid';
const TIMINGS = {
  short: { load:1200, c1:1500, c2:1900, rosterScroll:3800, gap:300, toTop:600, tabWait:500, boardScroll:2800, c5:1900 },
  mid:   { load:1450, c1:1950, c2:2350, rosterScroll:4700, gap:350, toTop:720, tabWait:580, boardScroll:3350, c5:2350 },
  full:  { load:1800, c1:2600, c2:3000, rosterScroll:6000, gap:400, toTop:900, tabWait:700, boardScroll:4200, c5:3000 },
};
const T = TIMINGS[MODE];

await page.goto(pathToFileURL(path.join(__dirname, '..', '..', 'coach-demo.html')).href);
await initCaption();
await page.waitForTimeout(T.load); // המדדים מונפשים

// 1
await caption('הדשבורד שלך — כל המתאמנים במקום אחד');
await page.waitForTimeout(T.c1);
// 2
await caption('מי פעיל · אחוז התמדה · מי צריך תשומת לב');
await page.waitForTimeout(T.c2);
// 3 — גלילה ברוסטר
await caption('כל מתאמן: יעד, מגמת משקל ורצף ימים');
const docH = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
await smoothScrollTo(Math.min(docH, 900), T.rosterScroll);
await page.waitForTimeout(T.gap);
// 4 — מעבר ללוח המאמנים
await smoothScrollTo(0, T.toTop);
await page.click('#tab-board');
await page.waitForTimeout(T.tabWait);
await caption('מובילים ועולים = חשיפה ולידים חדשים');
const boardH = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
await smoothScrollTo(Math.min(boardH, 700), T.boardScroll);
await page.waitForTimeout(T.gap);
// 5 — סיום
await smoothScrollTo(0, T.toTop);
await caption('ShapEat למאמנים · shapeat.co.il/coaches');
await page.waitForTimeout(T.c5);

await context.close();
await browser.close();
const vid = fs.readdirSync(outDir).find(f => f.endsWith('.webm'));
console.log('raw video ->', path.join(outDir, vid));
