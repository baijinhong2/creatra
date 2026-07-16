// Verify login bug fix: after login, page should show user state without refresh
import { chromium } from '@playwright/test';
const URL = 'http://localhost:3000';
const OUT = '/tmp/vp-audit/v072-final';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // 1. Visit as guest, verify sidebar shows 登录 button
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const guestLoginBtn = await page.locator('button:has-text("登录")').count();
  const guestAvatar = await page.locator('text=Dev Test').count();
  console.log(`  Guest state: 登录 button=${guestLoginBtn}, Dev Test avatar=${guestAvatar}`);

  // 2. Open login modal, log in
  await page.locator('button:has-text("登录")').first().click();
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'devtest@vp.local');
  await page.fill('input[type="password"]', 'dev123');
  await page.click('button[type="submit"]:has-text("登录")');
  // Wait for state to propagate, BUT DO NOT REFRESH
  await page.waitForTimeout(1500);

  // 3. After login (no refresh), should show user state
  await page.waitForTimeout(3000); // give state propagation time
  const postLoginBtn = await page.locator('button:has-text("登录")').count();
  const postLoginAvatar = await page.locator('text=Dev Test').count();
  const recentConvs = await page.locator('text=最近对话').count();
  console.log(`  Post-login (no refresh): 登录 button=${postLoginBtn}, Dev Test avatar=${postLoginAvatar}, 最近对话=${recentConvs}`);

  if (postLoginBtn > 0) {
    console.error('  ✗ BUG: 登录 button still visible after login');
    process.exit(1);
  }
  if (postLoginAvatar === 0) {
    console.error('  ✗ BUG: User avatar not shown after login');
    process.exit(1);
  }

  await page.screenshot({ path: `${OUT}/post-login-no-refresh.png`, fullPage: true });
  console.log('  ✓ Login state propagated without refresh');

  // 4. Test logout also works
  // Click on user menu (avatar at bottom)
  const userMenu = page.locator('button:has-text("Dev Test")').first();
  if (await userMenu.isVisible()) {
    await userMenu.click();
    await page.waitForTimeout(500);
    const logoutBtn = page.locator('button:has-text("登出")');
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForTimeout(1500);
      const backToGuest = await page.locator('button:has-text("登录")').count();
      console.log(`  After logout: 登录 button=${backToGuest}`);
      if (backToGuest === 0) {
        console.error('  ✗ BUG: 登录 button not shown after logout');
        process.exit(1);
      }
      console.log('  ✓ Logout works without refresh');
    }
  }

  await browser.close();
  console.log('\n✓ Login bug verified FIXED');
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
