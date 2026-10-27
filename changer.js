/**
 * changer.js — Core: dang nhap + doi mat khau 1 tai khoan
 * Dung Chrome that (real browser) qua CDP remote debugging
 * Turnstile duoc giai tu dong qua autocaptcha.pro API
 */
'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const LOGIN_URL     = 'https://forum.ngocrongonline.com/app/dang-nhap';
const CHANGE_PW_URL = 'https://forum.ngocrongonline.com/app/doi-mat-khau';
const CDP_ENDPOINT  = 'http://localhost:9333';

// ── autocaptcha.pro config ────────────────────────────────────────────────────
const AUTOCAPTCHA_KEY     = process.env.AUTOCAPTCHA_KEY || '';
const AUTOCAPTCHA_API     = 'https://autocaptcha.pro/apiv3/process';
const KNOWN_SITEKEY       = '0x4AAAAAAB0ZP2LlQgl9JHy7'; // sitekey cua forum.ngocrongonline.com

const TIMEOUT = {
  NAV:           30000,
  LOGIN_WAIT:    90000,
  ELEMENT:       10000,
  AFTER_SUBMIT:  8000,
  POLL:          1500,
  TURNSTILE_MAX: 90000,  // cho solver giai
  LOGIN_RETRY:   3,
};

/**
 * Giai Cloudflare Turnstile qua autocaptcha.pro
 * @param {string} pageUrl  - URL cua trang hien tai
 * @param {string} sitekey  - sitekey cua Turnstile widget
 * @returns {Promise<string|null>} token neu thanh cong, null neu that bai
 */
async function solveTurnstile(pageUrl, sitekey) {
  if (!AUTOCAPTCHA_KEY) {
    console.log('  [Solver] Thieu AUTOCAPTCHA_KEY trong bien moi truong');
    return null;
  }
  console.log(`  [Solver] Gui Turnstile task: sitekey=${sitekey}`);

  const body = JSON.stringify({
    key: AUTOCAPTCHA_KEY,
    type: 'cloudflare',
    pageurl: pageUrl,
    websitekey: sitekey,
  });

  try {
    const res = await fetch(AUTOCAPTCHA_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await res.json();
    console.log('  [Solver] HTTP '+res.status+' response:', JSON.stringify(data));

    const token = (typeof data.captcha === 'string' ? data.captcha : data.captcha?.token) ||
      data.token || data.solution?.token || data.data?.captcha || data.data?.token;

    if (res.ok && token) {
      console.log('  [Solver] Token nhan duoc ('+token.length+' chars)');
      return token;
    }
    console.log('  [Solver] That bai: '+(data.message || data.error || 'Khong co token'));
    return null;
  } catch (err) {
    console.log(`  [Solver] Error: ${err.message}`);
    return null;
  }
}

/**
 * Lay sitekey cua Turnstile tu trang
 * @param {import('playwright').Page} page
 * @returns {Promise<string|null>}
 */
async function getTurnstileSitekey(page) {
  return page.evaluate(() => {
    // Tim trong iframe src
    const iframes = document.querySelectorAll('iframe[src*="challenges.cloudflare.com"]');
    for (const iframe of iframes) {
      const match = iframe.src.match(/[?&]sitekey=([^&]+)/);
      if (match) return match[1];
    }
    // Tim trong div data-sitekey
    const divs = document.querySelectorAll('[data-sitekey]');
    for (const div of divs) {
      const sk = div.getAttribute('data-sitekey');
      if (sk) return sk;
    }
    // Tim trong script
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const match = s.textContent.match(/sitekey['":\s]+['"]([0-9a-zA-Z_-]{20,})['"]/);
      if (match) return match[1];
    }
    return null;
  }).catch(() => null);
}

/**
 * Inject token Turnstile vao trang
 * @param {import('playwright').Page} page
 * @param {string} token
 */
async function injectTurnstileToken(page, token) {
  await page.evaluate((t) => {
    // Set vao input hidden cf-turnstile-response
    const inputs = document.querySelectorAll('input[name="cf-turnstile-response"], [name="cf-turnstile-response"]');
    inputs.forEach(inp => {
      inp.value = t;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Goi callback data-callback cua widget (trang nay dung onCaptchaSuccess)
    const widgets = document.querySelectorAll('.cf-turnstile[data-callback]');
    widgets.forEach(w => {
      const cb = w.getAttribute('data-callback');
      if (cb && typeof window[cb] === 'function') {
        try { window[cb](t); } catch(e) { console.warn('callback err:', e); }
      }
    });

    // Fallback: goi cac callback pho bien
    const callbacks = ['onCaptchaSuccess', 'cfTurnstileCallback', 'turnstileCallback', 'onTurnstileSuccess'];
    for (const cb of callbacks) {
      if (typeof window[cb] === 'function') {
        try { window[cb](t); } catch {}
      }
    }
  }, token).catch(() => {});
}

/**
 * @param {Object} opts
 * @param {string}  opts.username
 * @param {string}  opts.oldPassword
 * @param {string}  opts.newPassword
 * @param {boolean} opts.headless
 * @param {string}  opts.screenshotDir
 * @returns {Promise<{success: boolean|null, message: string}>}
 */
async function changePassword({ username, oldPassword, newPassword, headless = false, screenshotDir = 'screenshots' }) {
  let browser, page;
  const apiResponses = [];

  try {
    // ── Connect vao Chrome that qua CDP ───────────────────────────────
    browser = await chromium.connectOverCDP(CDP_ENDPOINT);
    const contexts = browser.contexts();
    const context  = contexts.length > 0 ? contexts[0] : await browser.newContext();

    // Profile automation co the dang giu session account truoc do.
    // Xoa session trong context rieng truoc moi account de tranh redirect thang vao dien-dan-0.
    await context.clearCookies();
    for (const existingPage of context.pages()) {
      try {
        if (existingPage.url().includes("ngocrongonline.com")) {
          await existingPage.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
          });
        }
      } catch {}
    }

    page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT.ELEMENT);

    page.on('response', async res => {
      const method = res.request().method();
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        try {
          const raw = await res.text();
          let body = raw;
          try { body = JSON.parse(raw); } catch {}
          apiResponses.push({ url: res.url(), status: res.status(), method, body });
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

      try {
        await page.locator('input[name="user"]').waitFor({ state: 'visible', timeout: TIMEOUT.LOGIN_WAIT });
        await page.locator('input[name="pass"]').waitFor({ state: 'visible', timeout: TIMEOUT.LOGIN_WAIT });
      } catch (formError) {
        throw new Error('Login form unavailable at ' + page.url() + ' (' + formError.message + ')');
      }

      await _fillStable(page.locator('input[name="user"]'), username, 'user');
      await _fillStable(page.locator('input[name="pass"]'), oldPassword, 'pass');

      // ── Giai Turnstile ────────────────────────────────────────────
      // Buoc 1: Thu lay token tu Chrome that (da tu solve)
      console.log(`  [Turnstile] Kiem tra token tu Chrome...`);
      let token = await _pollToken(page, 5000, TIMEOUT.POLL);

      if (!token) {
        // Buoc 2: Dung solver API
        console.log(`  [Turnstile] Chrome chua co token, dung autocaptcha.pro solver...`);
        const sitekey = (await getTurnstileSitekey(page)) || KNOWN_SITEKEY;
        if (sitekey) {
          console.log(`  [Turnstile] Sitekey: ${sitekey}`);
          token = await solveTurnstile(page.url(), sitekey);
          if (token) {
            await injectTurnstileToken(page, token);
            await page.waitForTimeout(500);
            // Verify token da duoc inject
            const injected = await page.evaluate(() => {
              const el = document.querySelector('input[name="cf-turnstile-response"]');
              return el ? el.value : '';
            }).catch(() => '');
            console.log(`  [Turnstile] Inject ${injected.length > 0 ? 'OK' : 'FAIL'}`);
          } else {
            console.log(`  [Turnstile] Solver that bai, thu submit binh thuong...`);
          }
        } else {
          // Khong tim thay sitekey, co the la managed mode (tu solve)
          console.log(`  [Turnstile] Khong tim thay sitekey, cho Chrome tu solve (60s)...`);
          token = await _pollToken(page, TIMEOUT.TURNSTILE_MAX, TIMEOUT.POLL);
          if (token) {
            console.log(`  [Turnstile] Chrome tu solve OK!`);
          } else {
            console.log(`  [Turnstile] Timeout, thu submit thang...`);
          }
        }
      } else {
        console.log(`  [Turnstile] Chrome da co token OK!`);
      }

      // Submit
      apiResponses.length = 0;
      await page.locator('button[type="submit"]').first().click();

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

        if (_isTurnstileError(errText)) {
          loginError = `Turnstile fail attempt ${attempt}`;
          console.log(`  [Turnstile] Xac minh that bai, retry...`);
          await page.waitForTimeout(2000);
          continue;
        }

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
    console.log(`  [ChangePW] Mo trang doi mat khau...`);
    await page.goto(CHANGE_PW_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT.NAV });
    await page.waitForTimeout(2000);

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
    if (classified.old) await _fillStable(classified.old, oldPassword, 'old password');
    if (classified.new) await _fillStable(classified.new, newPassword, 'new password');
    if (classified.confirm) await _fillStable(classified.confirm, newPassword, 'confirm password');

    // Chi bat hien thi sau khi dien xong de khong lam form reset gia tri.
    if (!headless) {
      await _revealPasswordFields(page);
    }

    // Trang doi mat khau co the co Turnstile rieng; token o trang dang nhap khong dung lai duoc.
    console.log(`  [ChangePW] Kiem tra Turnstile cua trang doi mat khau...`);
    let changeToken = await _pollToken(page, 20000, TIMEOUT.POLL);
    if (!changeToken) {
      const changeSitekey = (await getTurnstileSitekey(page)) || KNOWN_SITEKEY;
      console.log(`  [ChangePW] Sitekey: ${changeSitekey}`);
      changeToken = await solveTurnstile(page.url(), changeSitekey);
      if (changeToken) {
        await injectTurnstileToken(page, changeToken);
        await page.waitForTimeout(500);
        console.log(`  [ChangePW] Turnstile trang doi mat khau: Inject OK`);
      } else {
        console.log(`  [ChangePW] Khong lay duoc token Turnstile trang doi mat khau`);
      }
    } else {
      console.log(`  [ChangePW] Turnstile trang doi mat khau da co token`);
    }

    await page.waitForTimeout(400);

    // ── BUOC 4: Submit ────────────────────────────────────────────────
    const submitBtn = await _findSubmit(page);
    if (!submitBtn) {
      await _screenshot(page, screenshotDir, username + '_no_submit');
      await page.close().catch(() => {});
      return { success: false, message: 'Khong tim thay nut submit' };
    }

    console.log(`  [ChangePW] Da dien form, dang bam nut doi mat khau...`);
    await submitBtn.click();
    await page.waitForTimeout(TIMEOUT.AFTER_SUBMIT);
    console.log(`  [ChangePW] Da submit, dang kiem tra ket qua...`);

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
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function _revealPasswordFields(page) {
  await page.evaluate(() => {
    document.querySelectorAll('input[type="password"]').forEach(input => {
      input.type = 'text';
    });
  });
  console.log('  [ChangePW] Da bat hien thi cac truong mat khau (headless=false)');
}

async function _fillStable(locator, value, label) {
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  await locator.fill(String(value));
  await locator.dispatchEvent('input').catch(() => {});
  await locator.dispatchEvent('change').catch(() => {});
  await locator.evaluate(el => el.blur()).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 250));
  const actual = await locator.inputValue().catch(() => '');
  if (actual !== String(value)) {
    const meta = await locator.evaluate(el => ({
      name: el.name || '', id: el.id || '', type: el.type || '',
      maxLength: el.maxLength, actualLength: (el.value || '').length
    })).catch(() => ({}));
    throw new Error(`Khong dien duoc truong ${label} (expectedLength=${String(value).length}, actualLength=${meta.actualLength ?? actual.length}, maxLength=${meta.maxLength ?? 'unknown'}, name=${meta.name || '-'}, id=${meta.id || '-'})`);
  }
}

async function _pollToken(page, maxWait, interval) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const token = await page.evaluate(() => {
      const el = document.querySelector('input[name="cf-turnstile-response"]');
      return el ? el.value : '';
    }).catch(() => '');
    if (token && token.length > 10) return token;
    await page.waitForTimeout(interval);
  }
  return null;
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
  const meaningfulResponses = apiResponses.filter(r =>
    !/challenges\.cloudflare\.com|cdn-cgi\/challenge-platform|ingest\.sentry\.io|google-analytics\.com|analytics|telemetry/i.test(r.url || '')
  );
  if (meaningfulResponses.length > 0) {
    const last = meaningfulResponses[meaningfulResponses.length - 1];
    const body = last.body;
    const msg  = typeof body === 'string'
      ? body.replace(/\s+/g, ' ').slice(0, 300)
      : (body?.message || body?.msg || body?.data?.message || '');
    const bodyText = typeof body === 'string' ? body : JSON.stringify(body || {});
    console.log(`  [ChangePW] Response ${last.status} ${last.method || ''} ${last.url}`);
    console.log(`  [ChangePW] Response body: ${msg || bodyText.slice(0, 300)}`);

    if (last.status >= 200 && last.status < 300) {
      const isCloudflareChallenge = /challenges\.cloudflare\.com|cdn-cgi\/challenge-platform/i.test(last.url);
      if (isCloudflareChallenge) {
        return { success: false, message: 'Cloudflare challenge chan request doi mat khau' };
      }
      const ok   = body?.success === true || /thanh.cong|th?nh c?ng|doi mat khau thanh cong|success/i.test(msg);
      const fail = body?.success === false || /that bai|th?t b?i|sai mat khau|sai m?t kh?u|loi|l?i|error|fail|failure/i.test(msg);
      if (ok)   return { success: true,  message: `Doi mat khau thanh cong: ${msg || 'OK'}` };
      if (fail) return { success: false, message: `Doi mat khau that bai: ${msg || bodyText.slice(0, 160)}` };
      // Response 2xx khong co message: tiep tuc kiem tra text cua trang.
    }
    if (last.status >= 400) {
      return { success: false, message: `HTTP ${last.status}: ${msg || bodyText.slice(0, 160)}` };
    }
  }

  const text  = await page.evaluate(() => document.body.innerText).catch(() => '');
  const lower = text.toLowerCase();
  if (/thành công|doi mat khau thanh cong|cap nhat thanh cong|success/.test(lower))
    return { success: true, message: 'Doi mat khau thanh cong' };
  if (/sai mat khau|khong dung|loi|error|that bai/.test(lower))
    return { success: false, message: 'Doi mat khau that bai (text match)' };

  // Da submit, khong co response loi va trang khong hien thong bao that bai.
  await _screenshot(page, 'screenshots', `success_no_error_${Date.now()}`);
  return { success: true, message: 'Doi mat khau thanh cong (khong co loi)' };
}

async function _screenshot(page, dir, name) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
  } catch {}
}

module.exports = { changePassword };
