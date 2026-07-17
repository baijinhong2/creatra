// Simulate an expired session: clear vp_session cookie, then send a message.
// Expect: friendly error + login modal opens.
import { chromium } from '/Users/Zhuanz/Documents/project/viralpost/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/vp-audit/auth-friend';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Load page first (server sets some default state)
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

// Clear the session cookie (simulate expired session)
await ctx.clearCookies();
await page.evaluate(() => {
  // Also clear localStorage of any auth state
  try { localStorage.clear(); } catch {}
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Now try to send a message as a guest
const composer = page.locator('textarea, [contenteditable="true"], input[placeholder*="问点啥"]').first();
const isVisible = await composer.isVisible().catch(() => false);
console.log(`Composer visible: ${isVisible}`);

if (isVisible) {
  await composer.click();
  await composer.fill('今天发什么推文');
  await page.waitForTimeout(300);
  // Click send (Enter)
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);

  // Check for login modal
  const modal = page.locator('text=creatra').locator('..').locator('..').first();
  const modalVisible = await page.locator('text=登录你的社交运营顾问').isVisible().catch(() => false);
  console.log(`Login modal opened: ${modalVisible}`);

  await page.screenshot({ path: `${OUT}/01-after-send.png`, fullPage: false });
  console.log('✓ 01-after-send.png');

  // Check error message in chat
  const errorBox = page.locator('text=出了点问题').first();
  const errorVisible = await errorBox.isVisible().catch(() => false);
  console.log(`Friendly error shown: ${errorVisible}`);
  if (errorVisible) {
    const errorText = await errorBox.textContent();
    console.log(`Error text: ${errorText}`);
  }
}

await browser.close();
console.log('done');
