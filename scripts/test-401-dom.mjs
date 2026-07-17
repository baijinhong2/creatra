// Verify friendly error text is rendered (not just modal)
import { chromium } from '/Users/Zhuanz/Documents/project/creatra/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await ctx.clearCookies();
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const composer = page.locator('textarea, [contenteditable="true"], input[placeholder*="问点啥"]').first();
await composer.click();
await composer.fill('今天发什么推文');
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);

// Get all error-like text in the DOM
const errors = await page.locator('div').filter({ hasText: /登录已过期|服务器错误|出了点问题/ }).all();
console.log(`Found ${errors.length} error-like divs:`);
for (const e of errors) {
  const text = await e.textContent().catch(() => '');
  if (text && text.length < 200) {
    console.log(`  - ${text.trim()}`);
  }
}

// Modal check
const modal = await page.locator('text=登录你的社交运营顾问').isVisible().catch(() => false);
console.log(`Login modal visible: ${modal}`);

await browser.close();
