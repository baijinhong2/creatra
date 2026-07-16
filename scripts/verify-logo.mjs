// Verify new logo + favicon in browser tab
import { chromium } from '/Users/Zhuanz/Documents/project/viralpost/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/vp-audit/logo-v1';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// 1. main page with new logo in sidebar
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-main.png`, fullPage: false });
console.log('✓ 01-main.png');

// 2. crop just the top-left logo area
const sidebarTop = page.locator('aside, [class*="sidebar"]').first();
if (await sidebarTop.isVisible().catch(() => false)) {
  const logo = page.locator('img[alt="creatra"]').first();
  await logo.screenshot({ path: `${OUT}/02-zoom-logo.png` });
  console.log('✓ 02-zoom-logo.png');
}

// 3. login modal
const loginBtn = page.locator('button:has-text("登录")').first();
if (await loginBtn.isVisible().catch(() => false)) {
  await loginBtn.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/03-login-modal.png`, fullPage: false });
  console.log('✓ 03-login-modal.png');
}

// 4. check the browser tab favicon (rendered in headless context)
const faviconEl = await page.$('link[rel*="icon"]');
if (faviconEl) {
  const href = await faviconEl.getAttribute('href');
  console.log(`  favicon link: ${href}`);
}

await browser.close();
