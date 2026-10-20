/**
 * changer.js — Core: đăng nhập + đổi mật khẩu 1 tài khoản
 * Dùng playwright-extra + stealth plugin để bypass Cloudflare Turnstile
 */
'use strict';

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Gắn stealth plugin — patch hàng chục fingerprint signals
chromium.use(StealthPlugin());

const LOGIN_URL    = 'https://forum.ngocrongonline.com/app/dang-nhap';
const CHANGE_PW_URL = 'https://forum.ngocrongonline.com/app/doi-mat-khau';

const TIMEOUT = {
  NAV:           30000,
  LOGIN_WAIT:    90000,  // chờ user pass Turnstile tối đa 90s
  ELEMENT:       10000,
  AFTER_SUBMIT:  8000,
  TURNSTILE_POLL: 2000,  // poll mỗi 2s kiểm tra token
  LOGIN_RETRY:   3,
};

/**
 * @param {Object} opts
 * @param {string}  opts.username
 * @param {string}  opts.oldPassword
 * @param {string}  opts.newPassword
 * @param {boolean} opts.headless      — false = mở browser (default)
 * @param {string}  opts.screenshotDir
 * @returns {Promise<{success: boolean|null, message: string}>}
 */
async function changePassword({ username, oldPassword, newPassword, headless = false, screenshotDir = 'screenshots' }) {
  let browser, context, page;

  // Lưu API response từ các POST/PUT/PATCH calls
  const apiResponses = [];

  try {
    browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'vi-VN',
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: { 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
    });

    page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT.ELEMENT);

    // Intercept POST/PUT/PATCH để bắt API response
    page.on('response', async (res) => {
      const method = res.request().method();
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        try {
          const json = await res.json();
          apiResponses.push({ url: res.url(), status: res.status(), body: json });
        } catch {
          // non-JSON response, bỏ qua
        }
      }
    });

    // ── BƯỚC 1: Đăng nhập (stealth + retry) ────────────────────────────
    let loginSuccess = false;
    let loginError   = '';

    for (let attempt = 1; attempt <= TIMEOUT.LOGIN_RETRY; attempt++) {
      console.log(`  [Login ${attempt}/${TIMEOUT.LOGIN_RETRY}] ${username}`);

      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT.NAV });

      // Chờ page ổn định + Turnstile iframe load xong
      await page.waitForTimeout(2500);

      await page.fill('input[name="user"]', username);
      await page.waitForTimeout(300);
      await page.fill('input[name="pass"]', oldPassword);
      await page.waitForTimeout(300);

      // Chờ Turnstile tự resolve (stealth plugin giúp pass)
      // Poll hidden input — tối đa 30s trước khi submit
      const tokenOk = await _pollTurnstileToken(page, 30000, TIMEOUT.TURNSTILE_POLL);
      if (!tokenOk) {
        console.log(`  [Turnstile] Chua co token sau 30s, submit thu...`);
      } else {
        console.log(`  [Turnstile] Token OK!`);
      }

      // Reset API log
      apiResponses.length = 0;

      // Submit
      await page.click('button[type="submit"]:has-text("ĐĂNG NHẬP NGAY")');

      // Chờ redirect khỏi trang login
      try {
        await page.waitForURL(
          (url) => !url.toString().includes('dang-nhap'),
          { timeout: TIMEOUT.LOGIN_WAIT }
        );
        loginSuccess = true;
        break;

      } catch {
        // Phân tích lý do fail
        const errOnPage = await _getPageError(page);

        // Lỗi Turnstile hiện trên trang → retry
        if (errOnPage.toLowerCase().includes('xac minh') ||
            errOnPage.toLowerCase().includes('turnstile') ||
            errOnPage.toLowerCase().includes('khac phuc')) {
          loginError = `Turnstile fail (attempt ${attempt})`;
          console.log(`  [Turnstile] Xac minh that bai — retry ${attempt + 1}...`);
          await page.waitForTimeout(2000);
          continue;
        }

        // Lỗi sai mật khẩu → không retry
        const apiErr = apiResponses.find(r =>
          r.url.includes('login') || r.url.includes('auth') || r.url.includes('dang-nhap'));
        const apiMsg = apiErr?.body?.message || apiErr?.body?.error || '';

        if (apiMsg) {
          loginError = `Login that bai: ${apiMsg}`;
          if (apiMsg.match(/sai|incorrect|wrong|invalid/i)) break;
        } else {
          loginError = errOnPage || `Timeout ${TIMEOUT.LOGIN_WAIT / 1000}s`;
        }

        if (attempt < TIMEOUT.LOGIN_RETRY) {
          console.log(`  [Retry] ${loginError}`);
          await page.waitForTimeout(2000);
        }
      }
    }

    if (!loginSuccess) {
      return { success: false, message: loginError || 'Login that bai' };
    }

    console.log('  [Login] Thanh cong!');
    apiResponses.length = 0;

    // ── BƯỚC 2: Mở trang đổi mật khẩu ───────────────────────────────────
    await page.goto(CHANGE_PW_URL, { waitUntil: 'networkidle', timeout: TIMEOUT.NAV });
    await page.waitForTimeout(1500);

    // Kiểm tra bị redirect không
    if (!page.url().includes('doi-mat-khau')) {
      return { success: false, message: `Redirect khỏi trang đổi mật khẩu. URL: ${page.url()} — Có thể session hết hạn hoặc tài khoản không hợp lệ` };
    }

    // ── BƯỚC 3: Tìm và điền form ─────────────────────────────────────────
    const pwInputs = await page.$$('input[type="password"]');

    if (pwInputs.length === 0) {
      await _screenshot(page, screenshotDir, username + '_no_form');
      return { success: false, message: 'Không tìm thấy form đổi mật khẩu trên trang' };
    }

    // Phân loại inputs theo name/placeholder
    const classified = await classifyPasswordInputs(pwInputs);

    // Điền theo kết quả classify
    if (classified.old) await classified.old.fill(oldPassword);
    if (classified.new) await classified.new.fill(newPassword);
    if (classified.confirm) await classified.confirm.fill(newPassword);

    await page.waitForTimeout(400);

    // ── BƯỚC 4: Submit ───────────────────────────────────────────────────
    const submitBtn = await findSubmitButton(page);
    if (!submitBtn) {
      await _screenshot(page, screenshotDir, username + '_no_submit');
      return { success: false, message: 'Không tìm thấy nút submit' };
    }

    await submitBtn.click();

    // Chờ API response
    await page.waitForTimeout(TIMEOUT.AFTER_SUBMIT);

    // ── BƯỚC 5: Xét kết quả từ API response ─────────────────────────────
    if (apiResponses.length > 0) {
      const lastResp = apiResponses[apiResponses.length - 1];
      const body = lastResp.body;

      // Detect thành công/thất bại từ JSON response
      if (lastResp.status >= 200 && lastResp.status < 300) {
        const msg = body?.message || body?.msg || body?.data?.message || '';
        const isOk = body?.success === true || body?.status === 'success' || body?.ok === true ||
          (typeof msg === 'string' && msg.toLowerCase().match(/thành công|success/));
        const isFail = body?.success === false || body?.status === 'error' || body?.error ||
          (typeof msg === 'string' && msg.toLowerCase().match(/thất bại|lỗi|error|fail/));

        if (isOk) return { success: true, message: `Đổi mật khẩu thành công${msg ? ': ' + msg : ''}` };
        if (isFail) return { success: false, message: `Đổi mật khẩu thất bại: ${msg || body?.error || 'Server trả lỗi'}` };

        // HTTP 2xx nhưng không rõ success/fail → coi là thành công
        return { success: true, message: `Đã submit (HTTP ${lastResp.status}): ${msg || JSON.stringify(body).substring(0, 80)}` };
      }

      if (lastResp.status >= 400) {
        const msg = body?.message || body?.error || body?.msg || `HTTP ${lastResp.status}`;
        return { success: false, message: `Đổi mật khẩu thất bại: ${msg}` };
      }
    }

    // Fallback: kiểm tra text trên trang
    const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
    const lower = pageText.toLowerCase();
    const successPhrases = ['thành công', 'đổi mật khẩu thành công', 'thay đổi thành công', 'cập nhật thành công', 'success'];
    const errorPhrases = ['sai mật khẩu', 'không đúng', 'lỗi', 'error', 'thất bại', 'không hợp lệ', 'failed'];

    if (successPhrases.some(p => lower.includes(p))) {
      return { success: true, message: 'Đổi mật khẩu thành công (text match)' };
    }
    if (errorPhrases.some(p => lower.includes(p))) {
      const errEl = await page.$('[class*="error"], [class*="alert"], .toast').catch(() => null);
      const errText = errEl ? await errEl.textContent().catch(() => '') : '';
      return { success: false, message: `Đổi mật khẩu thất bại: ${errText.trim() || 'có lỗi xảy ra'}` };
    }

    // Không xác định — chụp screenshot
    await _screenshot(page, screenshotDir, username + '_unknown');
    return { success: null, message: 'Không xác định được kết quả — xem screenshot trong thư mục screenshots/' };

  } catch (err) {
    if (page) await _screenshot(page, screenshotDir, username + '_exception').catch(() => {});
    return { success: false, message: `Exception: ${err.message}` };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Phân loại password inputs theo name/placeholder/id
 */
async function classifyPasswordInputs(inputs) {
  const result = { old: null, new: null, confirm: null };

  for (const input of inputs) {
    const attrs = await input.evaluate(el => ({
      name: (el.name || '').toLowerCase(),
      placeholder: (el.placeholder || '').toLowerCase(),
      id: (el.id || '').toLowerCase(),
    }));
    const combined = `${attrs.name} ${attrs.placeholder} ${attrs.id}`;

    if (combined.match(/old|current|cu\b|hien|mat.?khau.?cu|password.?old|pass.?old/)) {
      result.old = input;
    } else if (combined.match(/confirm|nhap.?lai|xac.?nhan|again|retype|re.?password|verify/)) {
      result.confirm = input;
    } else {
      result.new = result.new || input; // first unclassified = new password
    }
  }

  // Fallback theo thứ tự index
  if (!result.new) {
    if (inputs.length === 3 && !result.old) {
      [result.old, result.new, result.confirm] = inputs;
    } else if (inputs.length === 2 && !result.confirm) {
      [result.new, result.confirm] = inputs;
    } else if (inputs.length === 1) {
      result.new = inputs[0];
    }
  }

  // Nếu chỉ có old và new nhưng không có confirm
  if (!result.confirm && inputs.length === 3) {
    result.confirm = inputs.find(i => i !== result.old && i !== result.new) || null;
  }

  return result;
}

/**
 * Tìm nút submit phù hợp nhất
 */
async function findSubmitButton(page) {
  // Ưu tiên button trong form có password input
  const candidates = [
    'button[type="submit"]:has-text("Đổi mật khẩu")',
    'button[type="submit"]:has-text("Đổi")',
    'button[type="submit"]:has-text("Lưu")',
    'button[type="submit"]:has-text("Cập nhật")',
    'button[type="submit"]:has-text("Xác nhận")',
    'button[type="submit"]:has-text("Thay đổi")',
    'input[type="submit"]',
    'button[type="submit"]',
  ];

  for (const selector of candidates) {
    const el = await page.$(selector).catch(() => null);
    if (el) return el;
  }
  return null;
}

/**
 * Poll hidden input cf-turnstile-response đến khi có token hoặc hết maxWait
 * @returns {Promise<boolean>}
 */
async function _pollTurnstileToken(page, maxWait, interval) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const token = await page.evaluate(() => {
      const el = document.querySelector('input[name="cf-turnstile-response"]');
      return el ? el.value : '';
    }).catch(() => '');
    if (token && token.length > 10) return true;
    await page.waitForTimeout(interval);
  }
  return false;
}

/**
 * Lấy error text hiển thị trên trang (nếu có)
 */
async function _getPageError(page) {
  return page.evaluate(() => {
    const selectors = [
      '[class*="error"]', '[class*="alert"]', '[class*="warning"]',
      '.toast', '.notification', '[class*="message"]',
    ];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
  }).catch(() => '');
}

async function _screenshot(page, dir, name) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}_${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
  } catch {}
}

module.exports = { changePassword };
