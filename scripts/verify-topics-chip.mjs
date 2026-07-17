// Verify: 今日选题 is at top of chips; /topics page still works
import { chromium } from '/Users/Zhuanz/Documents/project/viralpost/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/vp-audit/topics-chip';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 1. main page (guest) — chips should be visible
await page.screenshot({ path: `${OUT}/01-main-chips.png`, fullPage: false });
console.log('✓ 01-main-chips.png');

// 2. crop the chip area
const chipArea = page.locator('img[alt="creatra"]').first();
const allChips = await page.locator('button').filter({ hasText: /今日选题|今天发什么|取名|找对标/ }).all();
console.log(`Found ${allChips.length} top chips:`);
for (let i = 0; i < allChips.length; i++) {
  const text = (await allChips[i].textContent() || '').trim();
  console.log(`  ${i + 1}. ${text}`);
}

// 3. verify /topics page still works
await page.goto('http://localhost:3000/topics', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/02-topics-page.png`, fullPage: false });
console.log('✓ 02-topics-page.png');

await browser.close();
