/**
 * changer.js — Core: dang nhap + doi mat khau 1 tai khoan
 * Dung Chrome that (real browser) qua CDP remote debugging
 * → Cloudflare Turnstile pass binh thuong vi dung Chrome that
 */
'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const LOGIN_URL     = 'https://forum.ngocrongonline.com/app/dang-nhap';
const CHANGE_PW_URL = 'https://forum.ngocrongonline.com/app/doi-mat-khau';
const CDP_ENDPOINT  = 'http://localhost:9222';

const TIMEOUT = {
  NAV:           30000,
  LOGIN_WAIT:    90000,  // cho user pass Turnstile
  ELEMENT:       10000,
  AFTER_SUBMIT:  8000,
  POLL:          1500,   // poll turnstile token
  TURNSTILE_MAX: 60000,  // toi da cho turnstile
  LOGIN_RETRY:   3,
};

/**
 * @param {Object} opts
 * @param {string}  opts.username
 * @param {string}  opts.oldPassword
 * @param {string}  opts.newPassword
 * @param {boolean} opts.headless   — bi bo qua khi dung Chrome that
 * @param {string}  opts.screenshotDir
 * @returns {Promise<{success: boolean|null, message: string}>}
 */
async function changePassword({ username, oldPassword, newPassword, headless = false, screenshotDir = 'screenshots' }) {
  let browser, page;

  const apiResponses = [];

  try {
    // ── Connect vao Chrome that qua CDP ───────────────────────────────
    browser = await chromium.connectOverCDP(CDP_ENDPOINT);

    // Lay context mac dinh (window dang mo)
    const contexts = browser.contexts();
    const context  = contexts.length > 0 ? contexts[0] : await browser.newContext();

    // Mo tab moi de tranh lam phien tab khac
    page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT.ELEMENT);

    // Intercept responses
    page.on('response', async res => {
      if (['POST', 'PUT', 'PATCH'].includes(res.request().method())) {
        try {
          const json = await res.json();
          apiResponses.push({ url: res.url(), status: res.status(), body: json });
        } catch {}
      }
    });

    // ── BUOC 1: Dang nhap (retry 3 lan) ──────────────────────────────
    let loginSuccess = false;
    let loginError   = '';

    for (let attempt = 1; attempt <= TIMEOUT.LOGIN_RETRY; attempt++) {
      console.log(`  [Login ${attempt}/${TIMEOUT.LOGIN_RETRY}] ${username}`);

      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT.NAV });
      await page.waitForTimeout(2000);

      // Dien credentials
      await page.fill('input[name="user"]', username);
      await page.waitForTimeout(200);
      await page.fill('input[name="pass"]', oldPassword);
      await page.waitForTimeout(200);

      // Cho Turnstile tu resolve (Chrome that → pass rat nhanh)
      console.log(`  [Turnstile] Cho token...`);
      const gotToken = await _pollToken(page, TIMEOUT.TURNSTILE_MAX, TIMEOUT.POLL);
      if (!gotToken) {
        console.log(`  [Turnstile] Khong lay duoc token — thu submit thang...`);
      } else {
        console.log(`  [Turnstile] Token OK!`);
      }

      // Submit
      apiResponses.length = 0;
      await page.click('button[type="submit"]:has-text("ĐĂNG NHẬP NGAY")');

      try {
        await page.waitForURL(
          url => !url.toString().includes('dang-nhap'),
          { timeout: TIMEOUT.LOGIN_WAIT }
        );
        loginSuccess = true;
        console.log(`  [Login] Thanh cong! URL: ${page.url()}`);
        break;

      } catch {
        const errText = await _getErrorText(page);

        // Turnstile fail → retry
        if (_isTurnstileError(errText)) {
          loginError = `Turnstile fail attempt ${attempt}`;
          console.log(`  [Turnstile] Xac minh that bai, retry...`);
          await page.waitForTimeout(2000);
          continue;
        }

        // Sai mat khau → khong retry
        const apiResp = apiResponses.find(r =>
          r.url.includes('login') || r.url.includes('auth') || r.url.includes('dang-nhap'));
        const apiMsg = apiResp?.body?.message || apiResp?.body?.error || '';

        if (apiMsg) {
          loginError = `Login that bai: ${apiMsg}`;
          if (/sai|incorrect|wrong|invalid/i.test(apiMsg)) break;
        } else {
          loginError = errText || `Timeout ${TIMEOUT.LOGIN_WAIT / 1000}s`;
        }

        if (attempt < TIMEOUT.LOGIN_RETRY) {
          console.log(`  [Retry] ${loginError}`);
          await page.waitForTimeout(2000);
        }
      }
    }

    if (!loginSuccess) {
      await page.close().catch(() => {});
      return { success: false, message: loginError || 'Login that bai' };
    }

    apiResponses.length = 0;

    // ── BUOC 2: Mo trang doi mat khau ────────────────────────────────
    await page.goto(CHANGE_PW_URL, { waitUntil: 'networkidle', timeout: TIMEOUT.NAV });
    await page.waitForTimeout(1500);

    if (!page.url().includes('doi-mat-khau')) {
      await page.close().catch(() => {});
      return { success: false, message: `Khong vao duoc trang doi mat khau. URL: ${page.url()}` };
    }

    // ── BUOC 3: Dien form ─────────────────────────────────────────────
    const pwInputs = await page.$$('input[type="password"]');
    if (pwInputs.length === 0) {
      await _screenshot(page, screenshotDir, username + '_no_form');
      await page.close().catch(() => {});
      return { success: false, message: 'Khong tim thay form doi mat khau' };
    }

    const classified = await _classifyInputs(pwInputs);
    if (classified.old) await classified.old.fill(oldPassword);
    if (classified.new)  await classified.new.fill(newPassword);
    if (classified.confirm) await classified.confirm.fill(newPassword);

    await page.waitForTimeout(400);

    // ── BUOC 4: Submit ────────────────────────────────────────────────
    const submitBtn = await _findSubmit(page);
    if (!submitBtn) {
      await _screenshot(page, screenshotDir, username + '_no_submit');
      await page.close().catch(() => {});
      return { success: false, message: 'Khong tim thay nut submit' };
    }

    await submitBtn.click();
    await page.waitForTimeout(TIMEOUT.AFTER_SUBMIT);

    // ── BUOC 5: Ket qua ───────────────────────────────────────────────
    const result = await _detectResult(page, apiResponses);
    await page.close().catch(() => {});
    return result;

  } catch (err) {
    if (page) {
      await _screenshot(page, screenshotDir, username + '_exception').catch(() => {});
      await page.close().catch(() => {});
    }
    return { success: false, message: `Exception: ${err.message}` };
  } finally {
    // KHONG dong browser — vi la Chrome that dang chay
    // chi close tab (da dong o tren)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function _pollToken(page, maxWait, interval) {
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

async function _getErrorText(page) {
  return page.evaluate(() => {
    const sels = ['[class*="error"]','[class*="alert"]','[class*="warning"]','.toast','.message'];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    return '';
  }).catch(() => '');
}

function _isTurnstileError(text) {
  const t = (text || '').toLowerCase();
  return t.includes('xac minh') || t.includes('turnstile') ||
         t.includes('khac phuc') || t.includes('verification') ||
         t.includes('robot');
}

async function _classifyInputs(inputs) {
  const result = { old: null, new: null, confirm: null };
  for (const input of inputs) {
    const attrs = await input.evaluate(el => ({
      name: (el.name || '').toLowerCase(),
      placeholder: (el.placeholder || '').toLowerCase(),
      id: (el.id || '').toLowerCase(),
    }));
    const combined = `${attrs.name} ${attrs.placeholder} ${attrs.id}`;
    if (/old|current|cu\b|hien|mat.?khau.?cu/.test(combined)) {
      result.old = input;
    } else if (/confirm|nhap.?lai|xac.?nhan|again|retype|re.?pass/.test(combined)) {
      result.confirm = input;
    } else {
      result.new = result.new || input;
    }
  }
  // Fallback theo thu tu
  if (!result.new) {
    if (inputs.length === 3) [result.old, result.new, result.confirm] = inputs;
    else if (inputs.length === 2) [result.new, result.confirm] = inputs;
    else result.new = inputs[0];
  }
  if (!result.confirm && inputs.length === 3) {
    result.confirm = inputs.find(i => i !== result.old && i !== result.new) || null;
  }
  return result;
}

async function _findSubmit(page) {
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
  for (const sel of candidates) {
    const el = await page.$(sel).catch(() => null);
    if (el) return el;
  }
  return null;
}

async function _detectResult(page, apiResponses) {
  // Uu tien ket qua tu API response
  if (apiResponses.length > 0) {
    const last = apiResponses[apiResponses.length - 1];
    const body = last.body;
    const msg  = body?.message || body?.msg || body?.data?.message || '';

    if (last.status >= 200 && last.status < 300) {
      const ok   = body?.success === true || /thanh.cong|success/i.test(msg);
      const fail = body?.success === false || /that.bai|loi|error|fail/i.test(msg);
      if (ok)   return { success: true,  message: `Doi mat khau thanh cong: ${msg || 'OK'}` };
      if (fail) return { success: false, message: `Doi mat khau that bai: ${msg}` };
      return { success: true, message: `Submitted (HTTP ${last.status})` };
    }
    if (last.status >= 400) {
      return { success: false, message: `HTTP ${last.status}: ${msg || JSON.stringify(body).slice(0,80)}` };
    }
  }

  // Fallback: doc text trang
  const text  = await page.evaluate(() => document.body.innerText).catch(() => '');
  const lower = text.toLowerCase();
  if (/thành công|doi mat khau thanh cong|cap nhat thanh cong|success/.test(lower))
    return { success: true, message: 'Doi mat khau thanh cong' };
  if (/sai mat khau|khong dung|loi|error|that bai/.test(lower))
    return { success: false, message: 'Doi mat khau that bai (text match)' };

  await _screenshot(page, 'screenshots', `unknown_${Date.now()}`);
  return { success: null, message: 'Khong xac dinh duoc ket qua — xem screenshots/' };
}

async function _screenshot(page, dir, name) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
  } catch {}
}

module.exports = { changePassword };
