// Verify chat composer height and user pill style
import { chromium } from '@playwright/test';
const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/v072-final';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Login
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("登录")').first().click();
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');
  await page.click('button[type="submit"]:has-text("登录")');
  await page.waitForTimeout(3000);

  // Measure chat composer
  const composerBox = await page.locator('textarea[placeholder*="问点啥"]').boundingBox();
  console.log('  composer box:', composerBox);

  // Take focused screenshot of bottom
  await page.locator('textarea[placeholder*="问点啥"]').focus();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/bottom-composer-focus.png`, fullPage: false });
  console.log('  bottom-composer-focus ✓');

  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
