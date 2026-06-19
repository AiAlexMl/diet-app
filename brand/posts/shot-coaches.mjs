import pw from 'file:///C:/Users/alexm/.claude/skills/web-to-reels/scripts/node_modules/playwright-core/index.js';
const { chromium } = pw;
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exe = 'C:/Users/alexm/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1.5 });
await page.goto(pathToFileURL(path.join(__dirname, '..', '..', 'coaches.html')).href);
await page.evaluate(() => document.querySelector('.preview').scrollIntoView());
await page.waitForTimeout(2500); // לתת לוידאו להתחיל
await page.locator('.preview').screenshot({ path: path.join(__dirname, 'coaches-preview.png') });
await browser.close();
console.log('-> coaches-preview.png');
