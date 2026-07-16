// Verify final octopus icon + wordmark in app
import { chromium } from '/Users/Zhuanz/Documents/project/viralpost/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/vp-audit/logo-final';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

await page.screenshot({ path: `${OUT}/01-main.png`, fullPage: false });
console.log('✓ 01-main.png');

// Zoom on the brand row in sidebar
const brand = page.locator('img[alt="creatra"]').first();
await brand.screenshot({ path: `${OUT}/02-zoom-icon.png` });
console.log('✓ 02-zoom-icon.png');

// Login modal
const loginBtn = page.locator('button:has-text("登录")').first();
if (await loginBtn.isVisible().catch(() => false)) {
  await loginBtn.click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/03-login-modal.png`, fullPage: false });
  console.log('✓ 03-login-modal.png');
}

await browser.close();
