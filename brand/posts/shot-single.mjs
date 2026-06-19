import pw from 'file:///C:/Users/alexm/.claude/skills/web-to-reels/scripts/node_modules/playwright-core/index.js';
const { chromium } = pw;
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exe = 'C:/Users/alexm/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const files = process.argv.slice(2); // e.g. post-positioning.html post-coaches.html

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 2 });
for (const f of files) {
  await page.goto(pathToFileURL(path.join(__dirname, f)).href);
  await page.waitForTimeout(700);
  const card = await page.$('.card');
  const out = f.replace(/\.html$/, '.png');
  await card.screenshot({ path: path.join(__dirname, out) });
  console.log('->', out);
}
await browser.close();
