import { chromium } from '@playwright/test';
const URL = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('BEFORE LOGIN:');
  console.log('  URL:', page.url());
  console.log('  登录 button count:', await page.locator('button:has-text("登录")').count());
  console.log('  Dev Test count:', await page.locator('text=Dev Test').count());

  // Login
  await page.locator('button:has-text("登录")').first().click();
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');

  console.log('MODAL OPEN:');
  console.log('  Modal visible:', await page.locator('input[type="email"]').isVisible());

  await page.click('button[type="submit"]:has-text("登录")');
  await page.waitForTimeout(500);
  console.log('  500ms after submit — modal still visible:', await page.locator('input[type="email"]').isVisible());
  await page.waitForTimeout(1000);
  console.log('  1500ms after submit — modal still visible:', await page.locator('input[type="email"]').isVisible());
  await page.waitForTimeout(2000);
  console.log('  3500ms after submit — modal still visible:', await page.locator('input[type="email"]').isVisible());
  console.log('  登录 button count:', await page.locator('button:has-text("登录")').count());
  console.log('  Dev Test count:', await page.locator('text=Dev Test').count());

  await browser.close();
})();
