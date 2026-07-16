// Capture path-c q6 with sample tweets expanded
import { chromium } from '@playwright/test';
const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/v072-final';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
  const page = await context.newPage();

  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("登录")').first().click();
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');
  await page.click('button[type="submit"]:has-text("登录")');
  await page.waitForTimeout(2500);

  // path-c, skip to q6 by filling all 5 prior steps quickly
  await page.goto(`${URL}/onboarding/path-c`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  // q1
  await page.locator('button:has-text("独立开发")').click();
  await page.locator('button:has-text("下一步")').click();
  await page.waitForTimeout(300);
  // q2
  await page.locator('button:has-text("技术细节")').click();
  await page.locator('button:has-text("下一步")').click();
  await page.waitForTimeout(300);
  // q3
  await page.locator('button:has-text("影响力")').click();
  await page.locator('button:has-text("下一步")').click();
  await page.waitForTimeout(300);
  // q4
  await page.locator('button:has-text("下一步")').click();
  await page.waitForTimeout(300);
  // q5
  await page.locator('button:has-text("跳过")').click();
  await page.waitForTimeout(500);
  // q6 - expand sample tweets
  await page.locator('button:has-text("样例参考")').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/light-06c-path-c-q6-samples.png`, fullPage: true });
  console.log('  light-06c-path-c-q6-samples ✓');

  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
