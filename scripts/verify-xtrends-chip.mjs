// Verify: 今日X热点 is in position 2 (after 今日选题)
import { chromium } from '/Users/Zhuanz/Documents/project/creatra/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/vp-audit/xtrends-chip';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

await page.screenshot({ path: `${OUT}/01-main-chips.png`, fullPage: false });
console.log('✓ 01-main-chips.png');

// Get all visible chips (top 3 by default)
const chips = await page.locator('button').filter({ hasText: /今日选题|今日 X 热点|今天发什么|取名|找对标/ }).all();
console.log(`\nTop 3 chips (in order):`);
for (let i = 0; i < chips.length; i++) {
  const text = (await chips[i].textContent() || '').trim();
  console.log(`  ${i + 1}. ${text}`);
}

// Click "查看更多" to expand
const showAll = page.locator('button:has-text("查看更多")').first();
if (await showAll.isVisible().catch(() => false)) {
  await showAll.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/02-all-chips.png`, fullPage: false });
  console.log('\n✓ 02-all-chips.png (expanded)');

  // Re-check order with all visible
  const allChips = await page.locator('button').filter({ hasText: /今日|今天|取名|找对标|看评论|竞品|定位|策略|数据|沉淀|搜全网|找配图/ }).all();
  console.log(`\nAll chips (in order):`);
  for (let i = 0; i < allChips.length; i++) {
  const text = (await allChips[i].textContent() || '').trim();
  if (text && text.length < 20) {
  console.log(`  ${i + 1}. ${text}`);
  }
  }
}

await browser.close();
