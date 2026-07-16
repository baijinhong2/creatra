// Capture empty state in expanded mode
import { chromium } from '@playwright/test';
const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/v072-final';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("登录")').first().click();
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');
  await page.click('button[type="submit"]:has-text("登录")');
  await page.waitForTimeout(3000);

  // Collapsed state
  await page.screenshot({ path: `${OUT}/empty-collapsed.png`, fullPage: true });
  console.log('  empty-collapsed ✓');

  // Click "查看全部 11 项能力 ↓"
  await page.locator('button:has-text("查看全部")').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/empty-expanded.png`, fullPage: true });
  console.log('  empty-expanded ✓');

  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
