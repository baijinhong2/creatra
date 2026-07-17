// Crop the C logo area for sharper comparison
import { chromium } from '/Users/Zhuanz/Documents/project/creatra/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/vp-audit/gold-v2';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// Crop login modal C logo
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const loginBtn = page.locator('button:has-text("登录")').first();
await loginBtn.click();
await page.waitForTimeout(600);
const cLogo = page.locator('div:has-text("C")').filter({ hasText: /^C$/ }).first();
await cLogo.screenshot({ path: `${OUT}/zoom-C-logo.png` });
console.log('✓ zoom-C-logo.png');

await browser.close();
