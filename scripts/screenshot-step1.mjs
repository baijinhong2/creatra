// Step 1: Login modal flow verification
import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/step1';
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Visit main as guest (no auth) — should see main UI
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/01-main-guest.png`, fullPage: true });
  console.log('  01-main-guest ✓');

  // Click sidebar "登录" button — should open modal
  const loginBtn = page.locator('button:has-text("登录")').first();
  await loginBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/02-login-modal.png`, fullPage: false });
  console.log('  02-login-modal ✓');

  // Type credentials and submit
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');
  await page.click('button[type="submit"]:has-text("登录")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/03-after-login.png`, fullPage: true });
  console.log('  03-after-login ✓');

  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
