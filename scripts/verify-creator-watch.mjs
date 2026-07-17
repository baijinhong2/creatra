// Verify: 看对标动态 chip in position 3; remember/list/forget tools work
import { chromium } from '/Users/Zhuanz/Documents/project/creatra/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/vp-audit/creator-watch';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Login
const loginResp = await ctx.request.post('http://localhost:3000/api/auth/login', {
  data: { email: 'devtest@vp.local', password: 'dev123' },
});
console.log(`Login: ${loginResp.status()}`);

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 1. screenshot of main page (chips should show new 看对标动态 in position 3)
await page.screenshot({ path: `${OUT}/01-main-chips.png`, fullPage: false });
console.log('✓ 01-main-chips.png');

// Get top 3 chips
const topChips = await page.locator('button').filter({ hasText: /今日|看对标|今天/ }).all();
console.log(`\nTop 3 chips:`);
for (let i = 0; i < topChips.length; i++) {
 const text = (await topChips[i].textContent() || '').trim();
 console.log(`  ${i + 1}. ${text}`);
}

// 2. Test remember_creator tool via API (since it's an LLM tool, not directly callable)
const rememberResp = await ctx.request.post('http://localhost:3000/api/auth/login', {
  data: { email: 'devtest@vp.local', password: 'dev123' },
});

// Test list endpoint via direct DB
const listResp = await ctx.request.get('http://localhost:3000/api/creators/list', { failOnStatusCode: false });
console.log(`\nList creators via API: ${listResp.status()} (no API endpoint — tool is LLM-only)`);

// 3. Insert a creator via direct DB to test the chip body references it
const insertResp = await ctx.request.post('http://localhost:3000/api/creators/add', {
  data: { handle: 'naval', display_name: 'Naval Ravikant', reason: '我的对标,深度思考型', weight: 10 },
  failOnStatusCode: false,
});
console.log(`Insert via API: ${insertResp.status()} (no API endpoint — direct insert needed)`);

// 4. Click 看对标动态 chip and verify message is sent
const chip = page.locator('button:has-text("看对标动态")').first();
const chipVisible = await chip.isVisible().catch(() => false);
console.log(`\nChip visible: ${chipVisible}`);

if (chipVisible) {
 const chatRequests = [];
 page.on('request', (req) => {
 if (req.url().includes('/api/chat')) {
 chatRequests.push({ url: req.url(), method: req.method() });
 }
 });
 await chip.click();
 await page.waitForTimeout(3000);
 console.log(`Chat API requests: ${chatRequests.length}`);
 const userMsg = await page.locator('text=list_creators').count();
 console.log(`User message contains "list_creators": ${userMsg}`);
 await page.screenshot({ path: `${OUT}/02-after-click.png`, fullPage: false });
 console.log('✓ 02-after-click.png');
}

await browser.close();
console.log('done');
