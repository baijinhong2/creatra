// Verify: Sources panel shows '自己的 X 账号' as a top source
import { chromium } from '/Users/Zhuanz/Documents/project/creatra/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/vp-audit/xhandle-source';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Login first
const loginResp = await ctx.request.post('http://localhost:3000/api/auth/login', {
  data: { email: 'devtest@vp.local', password: 'dev123' },
});
console.log(`Login: ${loginResp.status()}`);

// Set x.handle
const setResp = await ctx.request.put('http://localhost:3000/api/preferences', {
  data: { key: 'x.handle', value: 'devtest' },
});
console.log(`Set x.handle: ${setResp.status()}`);

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Click sidebar 数据源 nav
const dataSrcBtn = page.locator('button:has-text("数据源")').first();
if (await dataSrcBtn.isVisible().catch(() => false)) {
  await dataSrcBtn.click();
  await page.waitForTimeout(500);
}

await page.screenshot({ path: `${OUT}/01-sources-with-xhandle.png`, fullPage: false });
console.log('✓ 01-sources-with-xhandle.png');

// Check the order of sources
const sourceLabels = await page.locator('span').filter({ hasText: /自己的 X 账号|X auth_token|X ct0|GitHub token/ }).all();
console.log(`\nSources in order:`);
for (let i = 0; i < sourceLabels.length; i++) {
  const text = (await sourceLabels[i].textContent() || '').trim();
  if (text.length < 20) console.log(`  ${i + 1}. ${text}`);
}

// Check the input type — when editing, x.handle should be text, others password
const editBtn = page.locator('button:has-text("替换")').first();
if (await editBtn.isVisible().catch(() => false)) {
  await editBtn.click();
  await page.waitForTimeout(300);
  const input = page.locator('input').first();
  const inputType = await input.getAttribute('type');
  console.log(`\nEdit mode input type: ${inputType} (expected: text for x.handle)`);
  await page.screenshot({ path: `${OUT}/02-editing-xhandle.png`, fullPage: false });
  console.log('✓ 02-editing-xhandle.png');
}

await browser.close();
console.log('done');
