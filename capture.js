/**
 * capture.js — Mở browser, đại ca login + đổi mật khẩu tay
 * Script bắt toàn bộ network request/response rồi lưu ra capture.json
 *
 * Chạy: node capture.js
 */
'use strict';

const { chromium } = require('playwright');

const LOGIN_URL    = 'https://forum.ngocrongonline.com/app/dang-nhap';
const CHANGE_PW_URL = 'https://forum.ngocrongonline.com/app/doi-mat-khau';
const CDP_ENDPOINT  = 'http://localhost:9222';
const OUT_FILE = 'capture.json';

(async () => {
  console.log('='.repeat(60));
  console.log(' CAPTURE MODE — dung Chrome that');
  console.log('='.repeat(60));
  console.log('Buoc 1: Chay open-chrome.bat truoc');
  console.log('Buoc 2: Chay node capture.js nay');
  console.log('Buoc 3: Tren Chrome vua mo, tu login + doi mat khau tay');
  console.log('='.repeat(60));

  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);

  const contexts = browser.contexts();
  const context  = contexts.length > 0 ? contexts[0] : await browser.newContext();
  const page = await context.newPage();
  const captured = [];

  // ── Bắt TẤT CẢ requests ───────────────────────────────────────────────
  page.on('request', req => {
    const method = req.method();
    const url    = req.url();
    // Chỉ lấy non-GET (POST/PUT/PATCH) hoặc URL có từ khoá liên quan
    if (method !== 'GET' || url.includes('/api') || url.includes('/auth') ||
        url.includes('/login') || url.includes('/password') || url.includes('/user')) {
      let body = null;
      try { body = req.postData(); } catch {}

      let bodyParsed = body;
      try { bodyParsed = JSON.parse(body); } catch {}

      captured.push({
        type: 'REQUEST',
        method,
        url,
        headers: req.headers(),
        body: bodyParsed,
        ts: new Date().toISOString(),
      });
      console.log(`>> ${method} ${url}`);
      if (body) console.log(`   body: ${body.substring(0, 200)}`);
    }
  });

  // ── Bắt TẤT CẢ responses ─────────────────────────────────────────────
  page.on('response', async res => {
    const method = res.request().method();
    const url    = res.url();
    const status = res.status();

    if (method !== 'GET' || url.includes('/api') || url.includes('/auth') ||
        url.includes('/login') || url.includes('/password') || url.includes('/user')) {
      let body = null;
      try { body = await res.json(); } catch {
        try { body = await res.text(); } catch {}
      }
      captured.push({
        type: 'RESPONSE',
        method,
        url,
        status,
        headers: res.headers(),
        body,
        ts: new Date().toISOString(),
      });
      console.log(`<< ${status} ${url}`);
      if (body) console.log(`   resp: ${JSON.stringify(body).substring(0, 200)}`);
    }
  });

  // ── Mở trang login ────────────────────────────────────────────────────
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  // ── Chờ đại ca thao tác + trang đổi mật khẩu ─────────────────────────
  console.log('\n[WAITING] Dang cho ban thao tac tren browser...');
  console.log('[WAITING] Script se tu luu sau khi ban navigate den trang doi mat khau va submit.\n');

  // Poll: khi detect đã navigate sang change pw page và submit → lưu
  let savedAfterChangePw = false;

  page.on('framenavigated', async frame => {
    if (frame !== page.mainFrame()) return;
    const url = frame.url();
    console.log(`[NAV] ${url}`);
    // Tự động lưu khi rời khỏi trang đổi mật khẩu (sau submit)
    if (savedAfterChangePw) return;
    if (url.includes('doi-mat-khau')) {
      console.log('[INFO] Da vao trang doi mat khau — dien form va bam submit.');
    }
  });

  // Chờ bất kỳ POST đến endpoint đổi mật khẩu → lưu
  let autoSaved = false;
  const checkAndSave = async () => {
    const changePwCalls = captured.filter(c =>
      c.type === 'RESPONSE' && c.method !== 'GET' &&
      (c.url.includes('password') || c.url.includes('doi-mat-khau') ||
       c.url.includes('change') || c.url.includes('update'))
    );
    if (changePwCalls.length > 0 && !autoSaved) {
      autoSaved = true;
      fs.writeFileSync(OUT_FILE, JSON.stringify(captured, null, 2), 'utf8');
      console.log(`\n[SAVED] Da luu ${captured.length} entries vao ${OUT_FILE}`);
      console.log('[SAVED] Change password API call detected!');
      printSummary(captured);
    }
  };

  // Poll mỗi 2s
  const interval = setInterval(checkAndSave, 2000);

  // Giữ browser mở tối đa 10 phút
  console.log('[INFO] Browser se tu dong dong sau 10 phut, hoac bam Ctrl+C de thoat som.');
  await page.waitForTimeout(600000).catch(() => {});

  clearInterval(interval);

  // Lưu tất cả dù chưa detect được change pw call
  if (!autoSaved) {
    fs.writeFileSync(OUT_FILE, JSON.stringify(captured, null, 2), 'utf8');
    console.log(`\n[SAVED] Luu ${captured.length} entries vao ${OUT_FILE}`);
    printSummary(captured);
  }

  // Khong close browser vi la Chrome that
  console.log('\nDone. Chrome van con mo.');
})();

function printSummary(captured) {
  console.log('\n' + '='.repeat(60));
  console.log(' SUMMARY');
  console.log('='.repeat(60));

  const posts = captured.filter(c => c.type === 'REQUEST' && c.method === 'POST');
  console.log(`\nTong POST requests: ${posts.length}`);
  posts.forEach((r, i) => {
    console.log(`\n[POST ${i+1}] ${r.url}`);
    if (r.body) console.log(`  body: ${JSON.stringify(r.body).substring(0, 300)}`);
  });

  const responses = captured.filter(c => c.type === 'RESPONSE' && c.method === 'POST');
  console.log(`\nTong POST responses: ${responses.length}`);
  responses.forEach((r, i) => {
    console.log(`\n[RESP ${i+1}] ${r.status} ${r.url}`);
    if (r.body) console.log(`  body: ${JSON.stringify(r.body).substring(0, 300)}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log(` => Xem chi tiet trong file: ${OUT_FILE}`);
  console.log('='.repeat(60));
}
