// Quick capture of login modal in dark mode
import { chromium } from '@playwright/test';
const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/v072-final';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Dark mode
  await page.addInitScript(() => {
    localStorage.setItem('vp_theme', 'dark');
  });

  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("登录")').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/login-modal-dark.png`, fullPage: false });
  console.log('  login-modal-dark ✓');

  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
