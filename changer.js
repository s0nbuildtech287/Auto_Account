/**
 * changer.js — Core: đăng nhập + đổi mật khẩu 1 tài khoản
 * Tự detect selectors + intercept API response để xác định kết quả
 */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LOGIN_URL = 'https://forum.ngocrongonline.com/app/dang-nhap';
const CHANGE_PW_URL = 'https://forum.ngocrongonline.com/app/doi-mat-khau';

const TIMEOUT = {
  NAV: 30000,
  LOGIN_WAIT: 60000,   // chờ sau khi click login (captcha)
  ELEMENT: 10000,
  AFTER_SUBMIT: 8000,
  TURNSTILE: 5000,     // chờ 1 lần poll Turnstile token
  TURNSTILE_MAX: 60000, // tổng thời gian chờ Turnstile tối đa
  LOGIN_RETRY: 3,     // số lần retry login nếu Turnstile fail
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
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
    });

    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'vi-VN',
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      },
    });

    // Stealth: xoa webdriver flag de Cloudflare khong detect
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
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

    // ── BƯỚC 1: Đăng nhập (có retry Turnstile) ─────────────────────────
    let loginSuccess = false;
    let loginError = '';

    for (let attempt = 1; attempt <= TIMEOUT.LOGIN_RETRY; attempt++) {
      console.log(`  [Login attempt ${attempt}/${TIMEOUT.LOGIN_RETRY}] ${username}`);

      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT.NAV });
      await page.waitForTimeout(1500);

      await page.fill('input[name="user"]', username);
      await page.fill('input[name="pass"]', oldPassword);

      // ── Chờ Cloudflare Turnstile render + lấy token ──────────────────
      const turnstileResult = await waitForTurnstileToken(page, {
        pollInterval: TIMEOUT.TURNSTILE,
        maxWait: TIMEOUT.TURNSTILE_MAX,
        screenshotDir,
        username,
        attempt,
      });

      if (!turnstileResult.ok) {
        loginError = `Turnstile: ${turnstileResult.reason}`;
        console.log(`  [Turnstile] ${turnstileResult.reason}`);
        if (attempt < TIMEOUT.LOGIN_RETRY) {
          console.log(`  [Retry] Login lại lần ${attempt + 1}...`);
          await page.waitForTimeout(2000);
          continue;
        }
        break;
      }

      console.log('  [Turnstile] Token OK — submit login...');

      // Reset API log trước khi submit
      apiResponses.length = 0;

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
        // Kiểm tra API response
        const loginResp = apiResponses.find(r =>
          r.url.includes('login') || r.url.includes('dang-nhap') || r.url.includes('auth'));
        if (loginResp?.body) {
          const msg = loginResp.body.message || loginResp.body.error || JSON.stringify(loginResp.body);
          loginError = `Login thất bại: ${msg}`;
          // Nếu là lỗi sai mật khẩu → không retry
          if (msg.toLowerCase().includes('sai') || msg.toLowerCase().includes('incorrect') ||
              msg.toLowerCase().includes('wrong')) {
            break;
          }
        } else {
          // Kiểm tra error message trên trang
          const errEl = await page.$('.error, [class*="error"], .alert, [class*="alert"]').catch(() => null);
          if (errEl) {
            const errText = await errEl.textContent().catch(() => '');
            loginError = `Login thất bại: ${errText.trim()}`;
          } else {
            loginError = `Login timeout sau ${TIMEOUT.LOGIN_WAIT / 1000}s`;
          }
        }

        if (attempt < TIMEOUT.LOGIN_RETRY) {
          console.log(`  [Retry] ${loginError} — thử lại lần ${attempt + 1}...`);
          await page.waitForTimeout(2000);
        }
      }
    }

    if (!loginSuccess) {
      return { success: false, message: loginError || 'Login thất bại' };
    }

    console.log('  [Login] Thành công!');
    // Reset API log sau khi login xong
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
 * Chờ Cloudflare Turnstile render + lấy token.
 *
 * KHÔNG click vào Turnstile bằng code — Cloudflare detect automation click
 * và reject token. Chỉ chờ:
 *   - Headful: Turnstile thường tự pass (real browser), hoặc user click tay
 *   - Headless: Turnstile thường tự pass nếu fingerprint hợp lệ
 *
 * @returns {Promise<{ok: boolean, reason?: string, token?: string}>}
 */
async function waitForTurnstileToken(page, { pollInterval, maxWait, screenshotDir, username, attempt }) {
  const start = Date.now();
  let logged = false;

  while (Date.now() - start < maxWait) {
    // Kiểm tra hidden input cf-turnstile-response đã có token chưa
    const token = await page.evaluate(() => {
      const el = document.querySelector('input[name="cf-turnstile-response"]');
      return el ? el.value : '';
    }).catch(() => '');

    if (token && token.length > 10) {
      return { ok: true, token };
    }

    if (!logged) {
      console.log(`  [Turnstile] Dang cho token... (neu headful, click "I'm not a robot" neu can)`);
      logged = true;
    }

    await page.waitForTimeout(pollInterval);
  }

  // Timeout — chụp screenshot để debug
  await _screenshot(page, screenshotDir, `${username}_turnstile_timeout_a${attempt}`);
  return { ok: false, reason: `Khong lay duoc token sau ${maxWait / 1000}s — click "I'm not a robot" thu cong neu headful` };
}

async function _screenshot(page, dir, name) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}_${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
  } catch {}
}

module.exports = { changePassword };
