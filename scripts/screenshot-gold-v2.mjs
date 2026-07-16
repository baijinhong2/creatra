// Compare new lighter glamorous gold (amber-400) across key pages.
import { chromium } from '/Users/Zhuanz/Documents/project/viralpost/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/vp-audit/gold-v2';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// helper: snap and dump
async function snap(path, name) {
  await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`✓ ${name}.png`);
}

await snap('/', '01-main');
await snap('/onboarding', '02-onboarding');
await snap('/onboarding/template', '03-template');

// Login modal
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const loginBtn = page.locator('button:has-text("登录")').first();
if (await loginBtn.isVisible().catch(() => false)) {
  await loginBtn.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/04-login-modal.png`, fullPage: false });
  console.log('✓ 04-login-modal.png');
}

await browser.close();
console.log('done');
