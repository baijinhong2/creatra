// Higher resolution zoom of user pill
import { chromium } from '@playwright/test';
const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/v072-final';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("登录")').first().click();
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');
  await page.click('button[type="submit"]:has-text("登录")');
  await page.waitForTimeout(3000);

  const userBtn = page.locator('button:has-text("Dev Test")').first();
  if (await userBtn.isVisible()) {
    const box = await userBtn.boundingBox();
    if (box) {
      // Capture with 4x device scale
      await page.screenshot({
        path: `${OUT}/user-pill-hires.png`,
        clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 },
        scale: 'device',
      });
    }
  }

  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
