/**
 * probe.js — thăm dò selectors trang login + đổi mật khẩu
 * Chạy: node probe.js <username> <password>
 * Sẽ mở browser có giao diện để xem, chụp screenshot từng bước
 */
const { chromium } = require('playwright');

const USERNAME = process.argv[2] || 'test_user';
const PASSWORD = process.argv[3] || 'test_pass';

const LOGIN_URL = 'https://forum.ngocrongonline.com/app/dang-nhap';
const CHANGE_PW_URL = 'https://forum.ngocrongonline.com/app/doi-mat-khau';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  console.log('[1] Mở trang đăng nhập...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'screenshots/01_login_page.png', fullPage: true });

  // In ra tất cả input fields
  const inputs = await page.$$eval('input', els =>
    els.map(el => ({ name: el.name, type: el.type, id: el.id, placeholder: el.placeholder, className: el.className }))
  );
  console.log('[LOGIN] Input fields:', JSON.stringify(inputs, null, 2));

  // In ra tất cả button/submit
  const buttons = await page.$$eval('button, input[type="submit"]', els =>
    els.map(el => ({ tag: el.tagName, type: el.type, text: el.textContent?.trim(), id: el.id, className: el.className }))
  );
  console.log('[LOGIN] Buttons:', JSON.stringify(buttons, null, 2));

  console.log('[2] Điền credentials...');
  // Thử các selector phổ biến
  try {
    await page.fill('input[name="username"], input[name="email"], input[type="text"]:first-of-type', USERNAME);
    await page.fill('input[name="password"], input[type="password"]', PASSWORD);
    await page.screenshot({ path: 'screenshots/02_filled.png', fullPage: true });

    console.log('[3] Submit login...');
    await page.click('button[type="submit"], input[type="submit"], button:has-text("ĐĂNG NHẬP"), button:has-text("Đăng nhập")');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/03_after_login.png', fullPage: true });
    console.log('[3] URL sau login:', page.url());

    // Network requests
    console.log('[4] Mở trang đổi mật khẩu...');
    await page.goto(CHANGE_PW_URL, { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'screenshots/04_change_pw_page.png', fullPage: true });

    const inputs2 = await page.$$eval('input', els =>
      els.map(el => ({ name: el.name, type: el.type, id: el.id, placeholder: el.placeholder }))
    );
    console.log('[CHANGE PW] Input fields:', JSON.stringify(inputs2, null, 2));

    const buttons2 = await page.$$eval('button, input[type="submit"]', els =>
      els.map(el => ({ tag: el.tagName, type: el.type, text: el.textContent?.trim(), id: el.id }))
    );
    console.log('[CHANGE PW] Buttons:', JSON.stringify(buttons2, null, 2));

  } catch (err) {
    console.error('Lỗi:', err.message);
    await page.screenshot({ path: 'screenshots/error.png', fullPage: true });
  }

  await browser.close();
})();
