/**
 * run.js — Entry point: đọc file CSV accounts, chạy đổi mật khẩu theo lô
 * Dùng: node run.js [options]
 * 
 * Flags:
 *   --file <path>      CSV file chứa accounts (default: accounts.csv)
 *   --headless         Chạy ẩn browser (default: false — có giao diện để giải captcha thủ công nếu cần)
 *   --concurrency <n>  Số tài khoản chạy song song (default: 1)
 *   --output <path>    File lưu kết quả (default: results.json)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { changePassword } = require('./changer');

// ──────────────────────────────────────────────────────────────────────────
// Parse arguments
// ──────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const FILE = getArg('--file', 'accounts.csv');
const HEADLESS = args.includes('--headless');
const CONCURRENCY = parseInt(getArg('--concurrency', '1'), 10);
const OUTPUT = getArg('--output', 'results.json');

console.log('='.repeat(60));
console.log('  Ngoc Rong Online -- Auto Change Password Tool');
console.log('='.repeat(60));
console.log(`  File:        ${FILE}`);
console.log(`  Headless:    ${HEADLESS}`);
console.log(`  Concurrency: ${CONCURRENCY}`);
console.log(`  Output:      ${OUTPUT}`);
console.log('='.repeat(60));

// ──────────────────────────────────────────────────────────────────────────
// Load accounts từ CSV
// ──────────────────────────────────────────────────────────────────────────
if (!fs.existsSync(FILE)) {
  console.error(`❌ File không tồn tại: ${FILE}`);
  console.log(`\nTạo file CSV mẫu với format:\n`);
  console.log(`username,old_password,new_password`);
  console.log(`user1,old123,new456`);
  console.log(`user2,old789,new012\n`);
  process.exit(1);
}

const csvContent = fs.readFileSync(FILE, 'utf8');
let accounts = [];

try {
  accounts = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
} catch (err) {
  console.error(`❌ Lỗi parse CSV: ${err.message}`);
  process.exit(1);
}

if (accounts.length === 0) {
  console.error(`❌ Không có tài khoản nào trong file ${FILE}`);
  process.exit(1);
}

console.log(`✅ Đã load ${accounts.length} tài khoản\n`);

// ──────────────────────────────────────────────────────────────────────────
// Chạy song song với concurrency limit
// ──────────────────────────────────────────────────────────────────────────
const results = [];

async function processAccount(acc, index) {
  const { username, old_password, new_password } = acc;

  if (!username || !old_password || !new_password) {
    console.log(`[${index + 1}/${accounts.length}] ⚠️  ${username || '(trống)'} — Thiếu thông tin, bỏ qua`);
    results.push({ username, success: false, message: 'Thiếu thông tin trong CSV' });
    return;
  }

  console.log(`[${index + 1}/${accounts.length}] 🔄 Đang xử lý: ${username}...`);

  const result = await changePassword({
    username,
    oldPassword: old_password,
    newPassword: new_password,
    headless: HEADLESS,
    screenshotDir: 'screenshots',
  });

  if (result.success) {
    console.log(`[${index + 1}/${accounts.length}] ✅ ${username} — ${result.message}`);
  } else if (result.success === false) {
    console.log(`[${index + 1}/${accounts.length}] ❌ ${username} — ${result.message}`);
  } else {
    console.log(`[${index + 1}/${accounts.length}] ⚠️  ${username} — ${result.message}`);
  }

  results.push({ username, ...result, timestamp: new Date().toISOString() });
}

async function runBatch() {
  const batches = [];
  for (let i = 0; i < accounts.length; i += CONCURRENCY) {
    batches.push(accounts.slice(i, i + CONCURRENCY));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    await Promise.all(
      batch.map((acc, idx) => processAccount(acc, batchIdx * CONCURRENCY + idx))
    );
  }
}

(async () => {
  const start = Date.now();
  await runBatch();
  const duration = ((Date.now() - start) / 1000).toFixed(2);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`✅ Hoàn thành ${results.length}/${accounts.length} tài khoản trong ${duration}s`);

  const successCount = results.filter(r => r.success === true).length;
  const failCount = results.filter(r => r.success === false).length;
  const unknownCount = results.filter(r => r.success === null).length;

  console.log(`   ✅ Thành công: ${successCount}`);
  console.log(`   ❌ Thất bại:   ${failCount}`);
  console.log(`   ⚠️  Không rõ:  ${unknownCount}`);
  console.log(`${'═'.repeat(70)}\n`);

  // Lưu kết quả
  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2), 'utf8');
  console.log(`📁 Kết quả đã lưu vào: ${OUTPUT}\n`);
})();
