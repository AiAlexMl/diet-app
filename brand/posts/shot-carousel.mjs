import pw from 'file:///C:/Users/alexm/.claude/skills/web-to-reels/scripts/node_modules/playwright-core/index.js';
const { chromium } = pw;
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exe = 'C:/Users/alexm/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(__dirname, 'post-day-carousel.html')).href);
await page.waitForTimeout(700);

const cards = await page.$$('.card');
console.log('cards:', cards.length);
const outDir = path.join(__dirname, 'day-carousel');
fs.mkdirSync(outDir, { recursive: true });
for (let i = 0; i < cards.length; i++) {
  await cards[i].screenshot({ path: path.join(outDir, `slide-${i + 1}.png`) });
}
await browser.close();
console.log('done -> day-carousel/slide-1..' + cards.length + '.png');
