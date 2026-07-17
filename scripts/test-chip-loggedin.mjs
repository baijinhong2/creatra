// Verify: logged-in user clicks chip → message goes to chat + fetch hits /api/chat
import { chromium } from '/Users/Zhuanz/Documents/project/viralpost/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/vp-audit/chip-loggedin';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// 1. Login via API directly (faster + reliable than UI form)
const loginResp = await ctx.request.post('http://localhost:3000/api/auth/login', {
  data: { email: 'devtest@vp.local', password: 'dev123' },
});
console.log(`Login API status: ${loginResp.status()}`);

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Should be logged in now
const userPill = await page.locator('div').filter({ hasText: /^[A-Z]$/ }).first();
const avatarVisible = await userPill.isVisible().catch(() => false);
console.log(`Logged in (avatar visible): ${avatarVisible}`);

await page.screenshot({ path: `${OUT}/01-loggedin.png`, fullPage: false });
console.log('✓ 01-loggedin.png');

// 2. Click 今日选题 chip
const chip = page.locator('button:has-text("今日选题")').first();
const chipVisible = await chip.isVisible().catch(() => false);
console.log(`Chip visible: ${chipVisible}`);

if (chipVisible) {
  // Track network requests to /api/chat
  const chatRequests = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/chat')) {
      chatRequests.push({ url: req.url(), method: req.method(), time: Date.now() });
    }
  });

  await chip.click();
  await page.waitForTimeout(3000);

  console.log(`Chat API requests after chip click: ${chatRequests.length}`);

  // Check if user message appeared in chat
  const userMsg = await page.locator('text=5-10 个今天可以写').count();
  console.log(`User message in chat: ${userMsg}`);

  // Check for login modal (should NOT open if logged in)
  const modalOpen = await page.locator('text=登录你的社交运营顾问').isVisible().catch(() => false);
  console.log(`Login modal opened (should be false): ${modalOpen}`);

  await page.screenshot({ path: `${OUT}/02-after-click.png`, fullPage: false });
  console.log('✓ 02-after-click.png');
}

await browser.close();
console.log('done');
