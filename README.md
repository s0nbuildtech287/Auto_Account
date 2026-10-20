# Auto Change Password — Ngọc Rồng Online Forum

Tự động đổi mật khẩu hàng loạt tài khoản trên `forum.ngocrongonline.com`.

---

## Cài đặt (chỉ cần 1 lần)

```bash
npm install
npx playwright install chromium
```

---

## Chuẩn bị file accounts

Mở file `accounts.csv` và điền danh sách tài khoản:

```csv
username,old_password,new_password
acc001,matkhau_cu_001,matkhau_moi_001
acc002,matkhau_cu_002,matkhau_moi_002
acc003,matkhau_cu_003,matkhau_moi_003
```

> `username` có thể là số điện thoại, email, hoặc tên đăng nhập.

---

## Chạy

### Bước đầu: Thăm dò với 1 account thật (BẮT BUỘC lần đầu)

```bash
node probe2.js <username> <password>
```

- Browser sẽ mở ra, tự điền credentials
- Nếu có Cloudflare Turnstile → tự giải tay
- Script sẽ in ra selectors của form đổi mật khẩu
- Lưu `api_log.json` và `session_cookies.json` để debug

### Chạy thật

**Headful (mở giao diện browser — an toàn, cần giải captcha tay):**
```bash
node run.js
# hoặc
npm run headful
```

**Headless (ẩn browser — dùng khi đã test OK):**
```bash
node run.js --headless --concurrency 3
# hoặc  
npm run headless
```

### Các options

| Flag | Default | Mô tả |
|------|---------|-------|
| `--file <path>` | `accounts.csv` | File CSV danh sách accounts |
| `--headless` | false | Ẩn browser |
| `--concurrency <n>` | 1 | Số accounts chạy song song |
| `--output <path>` | `results.json` | File lưu kết quả |

---

## Kết quả

Sau khi chạy xong, kết quả lưu trong `results.json`:

```json
[
  {
    "username": "acc001",
    "success": true,
    "message": "Đổi mật khẩu thành công",
    "timestamp": "2026-10-20T10:00:00.000Z"
  },
  {
    "username": "acc002", 
    "success": false,
    "message": "Login thất bại: Sai mật khẩu",
    "timestamp": "2026-10-20T10:00:05.000Z"
  }
]
```

---

## Lưu ý quan trọng

### Cloudflare Turnstile (captcha)
- Trang login có Cloudflare Turnstile
- Khi chạy **headful** (có giao diện): captcha thường tự giải (Cloudflare nhận diện real browser)
- Khi chạy **headless**: có thể bị chặn — nếu vậy phải dùng headful
- Script chờ **60 giây** để giải captcha trước khi timeout

### Concurrency
- Không nên dùng `--concurrency` > 3 để tránh bị rate-limit
- Nếu nhiều tài khoản fail cùng lúc → giảm concurrency xuống 1

### Debug
- Screenshots lỗi lưu trong thư mục `screenshots/`
- Xem `api_log.json` (từ probe2) để biết API endpoint thật

---

## Cấu trúc file

```
Auto_Account/
├── accounts.csv     ← ĐIỀN VÀO ĐÂY
├── run.js           ← Entry point chính
├── changer.js       ← Core logic
├── probe.js         ← Thăm dò trang login (selectors)
├── probe2.js        ← Thăm dò đầy đủ sau khi login
├── results.json     ← Kết quả (tự tạo sau khi chạy)
├── screenshots/     ← Screenshots khi lỗi
└── api_log.json     ← Network log từ probe2
```
