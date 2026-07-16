// Capture path-b/recommend step 2 (style) and step 3 (language)
import { chromium } from '@playwright/test';
const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/v072-final';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("登录")').first().click();
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');
  await page.click('button[type="submit"]:has-text("登录")');
  await page.waitForTimeout(2500);

  await page.goto(`${URL}/onboarding/path-b/recommend`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Step 0 → 1
  await page.locator('button:has-text("独立开发")').click();
  await page.locator('button:has-text("下一步")').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/light-05b-path-b-rec-style.png`, fullPage: true });
  console.log('  light-05b-path-b-rec-style ✓');

  // Step 1 → 2
  await page.locator('button:has-text("干具体")').click();
  await page.locator('button:has-text("下一步")').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/light-05c-path-b-rec-language.png`, fullPage: true });
  console.log('  light-05c-path-b-rec-language ✓');

  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
