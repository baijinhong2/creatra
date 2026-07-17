// Verify: not logged in → user types + sends → modal opens, NO message in chat, NO error
import { chromium } from '/Users/Zhuanz/Documents/project/viralpost/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/vp-audit/auth-clean';
mkdirSync(OUT, { recursive: true });

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
await page.waitForTimeout(2000);

// Take screenshot
await page.screenshot({ path: `${OUT}/01-after-send.png`, fullPage: false });
console.log('✓ 01-after-send.png');

// Check: modal opened
const modalVisible = await page.locator('text=登录你的社交运营顾问').isVisible().catch(() => false);
console.log(`Login modal opened: ${modalVisible}`);

// Check: NO user message in chat
const userMsgs = await page.locator('text=今天发什么推文').count();
console.log(`User message in chat: ${userMsgs} (should be 1 — the composer input still has it)`);

// Check: NO error message in chat
const errorText = await page.locator('text=出了点问题').count();
console.log(`Error message visible: ${errorText} (should be 0)`);

const errorOldText = await page.locator('text=登录已过期').count();
console.log(`"登录已过期" text in chat: ${errorOldText} (should be 0 — only in modal)`);

// Check: input field still has the text (preserved for after login)
const inputVal = await composer.inputValue().catch(() => '');
console.log(`Input preserved: ${inputVal === '今天发什么推文' ? 'YES' : `NO (got: "${inputVal}")`}`);

await browser.close();
console.log('done');
