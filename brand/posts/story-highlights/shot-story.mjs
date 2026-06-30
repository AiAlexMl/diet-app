import pw from 'file:///C:/Users/alexm/.claude/skills/web-to-reels/scripts/node_modules/playwright-core/index.js';
const { chromium } = pw;
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exe = 'C:/Users/alexm/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const files = process.argv.slice(2);

const browser = await chromium.launch({ executablePath: exe });
// deviceScaleFactor 1 → element #shot (1080x1920) renders at exactly 1080x1920 (IG-native)
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
for (const f of files) {
  await page.goto(pathToFileURL(path.join(__dirname, f)).href);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(900);
  const el = await page.$('#shot');
  const out = f.replace(/\.html$/, '.png');
  await el.screenshot({ path: path.join(__dirname, out) });
  console.log('->', out);
}
await browser.close();
