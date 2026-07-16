// Verify path-c smart back button + q6 wizard flow
import { chromium } from '@playwright/test';

const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/v072-final';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Login
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("登录")').first().click();
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');
  await page.click('button[type="submit"]:has-text("登录")');
  await page.waitForTimeout(2500);

  // Visit path-c q1
  await page.goto(`${URL}/onboarding/path-c`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Verify q1 back is a Link (has href="/onboarding")
  const q1BackLink = page.locator('a[aria-label="返回"]');
  const q1LinkCount = await q1BackLink.count();
  const q1LinkHref = q1LinkCount > 0 ? await q1BackLink.first().getAttribute('href') : null;
  console.log(`  q1 back: link count=${q1LinkCount}, href=${q1LinkHref}`);

  // Click "独立开发" to enable next, then go to q2
  await page.locator('button:has-text("独立开发")').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("下一步")').click();
  await page.waitForTimeout(500);

  // Verify q2 back is a BUTTON (not a link)
  const q2BackBtn = page.locator('button[aria-label="上一步"]');
  const q2BtnCount = await q2BackBtn.count();
  console.log(`  q2 back: button count=${q2BtnCount}`);

  // Take a screenshot of q2 to verify visual
  await page.screenshot({ path: `${OUT}/light-06b-path-c-q2.png`, fullPage: true });
  console.log('  light-06b-path-c-q2 ✓');

  // Click back, verify we go back to q1
  await q2BackBtn.click();
  await page.waitForTimeout(500);
  const backToQ1 = await page.locator('a[aria-label="返回"]').count();
  console.log(`  After clicking back: q1 link count=${backToQ1}`);

  await browser.close();
  console.log('\nPath-c smart back test done');
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
