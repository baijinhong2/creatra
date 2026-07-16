// Capture guest main + login modal
import { chromium } from '@playwright/test';
const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/v072-final';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Guest main
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/gold-guest-main.png`, fullPage: false });
  console.log('  gold-guest-main ✓');

  // Open login modal
  await page.locator('button:has-text("登录")').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/gold-login-modal.png`, fullPage: false });
  console.log('  gold-login-modal ✓');

  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
