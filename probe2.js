/**
 * probe2.js — thăm dò TOÀN BỘ: login, form đổi mật khẩu, XHR calls
 * Chạy: node probe2.js <username> <password>
 * Browser có giao diện, tự giải Turnstile nếu cần
 */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const USERNAME = process.argv[2];
const PASSWORD = process.argv[3];

if (!USERNAME || !PASSWORD) {
  console.error('Dùng: node probe2.js <username> <password>');
  process.exit(1);
}

if (!fs.existsSync('screenshots')) fs.mkdirSync('screenshots');

const LOGIN_URL = 'https://forum.ngocrongonline.com/app/dang-nhap';
const CHANGE_PW_URL = 'https://forum.ngocrongonline.com/app/doi-mat-khau';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Bắt TẤT CẢ requests POST/PUT/PATCH
  const apiLog = [];
  page.on('request', req => {
    const method = req.method();
    const url = req.url();
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      let body = null;
      try { body = req.postData(); } catch {}
      apiLog.push({ type: 'REQUEST', method, url, body });
      console.log(`🌐 ${method} ${url}`);
    }
  });
  page.on('response', async res => {
    const method = res.request().method();
    const url = res.url();
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      let body = null;
      try { body = await res.json(); } catch { try { body = await res.text(); } catch {} }
      apiLog.push({ type: 'RESPONSE', method, url, status: res.status(), body });
      console.log(`✅ ${res.status()} ${url}`, JSON.stringify(body)?.substring(0, 100));
    }
  });

  // ── Bước 1: Login ──────────────────────────────────────────────────────
  console.log('\n[1] Mở trang đăng nhập...');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  console.log('[2] Điền credentials...');
  await page.fill('input[name="user"]', USERNAME);
  await page.fill('input[name="pass"]', PASSWORD);
  await page.screenshot({ path: 'screenshots/p2_01_before_login.png', fullPage: true });

  console.log('[3] Click login — CHỜ giải captcha nếu cần...');
  await page.click('button[type="submit"]:has-text("ĐĂNG NHẬP NGAY")');

  console.log('⏳ Đang chờ đăng nhập (tối đa 60s)...');
  try {
    await page.waitForURL(url => !url.toString().includes('dang-nhap'), { timeout: 60000 });
    console.log('✅ Login OK! URL:', page.url());
  } catch {
    console.log('⚠️  Timeout. URL:', page.url());
  }
  await page.screenshot({ path: 'screenshots/p2_02_after_login.png', fullPage: true });

  // ── Bước 2: Trang đổi mật khẩu ────────────────────────────────────────
  console.log('\n[4] Mở trang đổi mật khẩu...');
  await page.goto(CHANGE_PW_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/p2_03_change_pw.png', fullPage: true });
  console.log('[4] URL:', page.url());

  // In HTML form
  const formHTML = await page.evaluate(() => {
    const forms = document.querySelectorAll('form');
    return Array.from(forms).map(f => f.outerHTML.substring(0, 500)).join('\n---\n');
  });
  console.log('\n[FORMS HTML]:\n', formHTML || '(không có form)');

  // In input fields
  const inputs = await page.$$eval('input', els =>
    els.map(el => ({ name: el.name, type: el.type, id: el.id, placeholder: el.placeholder }))
  );
  console.log('\n[INPUTS]:', JSON.stringify(inputs, null, 2));

  // Tìm các button
  const buttons = await page.$$eval('button', els =>
    els.map(el => ({ text: el.textContent?.trim().substring(0, 60), type: el.type })).filter(b => b.text)
  );
  console.log('\n[BUTTONS]:', JSON.stringify(buttons.slice(0, 15), null, 2));

  // In text có "mật khẩu"
  const textContent = await page.evaluate(() => document.body.innerText);
  const lines = textContent.split('\n').filter(l => l.toLowerCase().includes('mật khẩu') || l.toLowerCase().includes('mat khau'));
  console.log('\n[DÒNG CÓ "MẬT KHẨU"]:', lines.slice(0, 20));

  // ── Bước 3: Thử điền và submit form (với mật khẩu fake) ────────────────
  const pwInputs = await page.$$('input[type="password"]');
  console.log(`\n[5] Tìm thấy ${pwInputs.length} input[type="password"]`);

  if (pwInputs.length > 0) {
    console.log('[5] Thử điền form đổi mật khẩu...');
    for (let i = 0; i < pwInputs.length; i++) {
      const attrs = await pwInputs[i].evaluate(el => ({ name: el.name, placeholder: el.placeholder, id: el.id }));
      console.log(`  Input ${i}: name="${attrs.name}" placeholder="${attrs.placeholder}" id="${attrs.id}"`);
      await pwInputs[i].fill(`test_probe_${i}`);
    }

    await page.screenshot({ path: 'screenshots/p2_04_filled_pw.png', fullPage: true });

    // Tìm submit button trong vùng form đổi mk
    const submitBtns = await page.$$eval('button[type="submit"], input[type="submit"]', els =>
      els.map(el => ({ text: el.textContent?.trim(), tagName: el.tagName }))
    );
    console.log('\n[6] Submit buttons:', JSON.stringify(submitBtns, null, 2));
  }

  // Lưu cookies
  const cookies = await context.cookies();
  fs.writeFileSync('session_cookies.json', JSON.stringify(cookies, null, 2), 'utf8');

  // Lưu API log
  fs.writeFileSync('api_log.json', JSON.stringify(apiLog, null, 2), 'utf8');
  console.log('\n📁 Đã lưu: session_cookies.json, api_log.json');
  console.log('📸 Screenshots trong thư mục: screenshots/');
  console.log('\n⏳ Giữ browser 120s để bạn khảo sát thêm. Ctrl+C để thoát sớm...');

  await page.waitForTimeout(120000).catch(() => {});
  await browser.close();
})();
