# AutoAccount – Hướng dẫn sử dụng

## 1. Chuẩn bị

Trên máy mới cần có:

- Google Chrome.
- File `AutoAccount_Setup.exe`.
- Extension AutoCaptchaPro.
- Key AutoCaptchaPro. " 557317e2e25da3bb73689080f71618be "

Không cần cài Node.js hoặc Python khi dùng bản `.exe`.

## 2. Chạy ứng dụng

Chạy:

```text
AutoAccount_Setup.exe
```

Lần đầu chạy, ứng dụng tự giải nén runtime vào:

```text
%LOCALAPPDATA%\AutoAccount
```

Không xóa thư mục này trong khi đang sử dụng.

## 3. Cài extension thủ công

Trong Manager, bấm `Launch` để mở Chrome debug port `9333`, sau đó:

1. Mở `chrome://extensions`.
2. Bật `Developer mode`.
3. Chọn `Load unpacked`.
4. Chọn đúng thư mục có file `manifest.json`:

```text
%LOCALAPPDATA%\AutoAccount\Extension\AutocaptchaProExtension
```

5. Mở extension, nhập key AutoCaptchaPro và bật Cloudflare.

Extension chỉ cần cài một lần trong profile Chrome automation này.

## 4. Cấu hình Google Sheet

Mở PowerShell bình thường, không cần quyền Administrator, rồi chạy:

```powershell
[Environment]::SetEnvironmentVariable(
  "SHEET_WEB_APP_URL",
  "https://script.google.com/macros/s/AKfycbzZbYNQvELg44x5e9WLUeY_mlP1OTKS_DKj5eQWtwyoJMj_smOo5ilRIkv3DV4Ri41I/exec",
  "User"
)
```

Sau đó đóng và mở lại `AutoAccount_Setup.exe`.

Apps Script phải được deploy dạng Web App với quyền truy cập `Anyone`. Khi đổi mật khẩu thành công, app sẽ cập nhật tài khoản ở cột B và mật khẩu mới ở cột C.

## 5. Nhập account

Có hai cách:

- `Single Add`: nhập một account.
- `Bulk Import`: nhập nhiều account theo dạng:

```text
username|current_password
```

Mật khẩu mới được nhập tại trường `New Password` và website giới hạn tối đa 15 ký tự.

## 6. Chọn account để chạy

1. Tích checkbox ở cột `Select`.
2. Bấm `CHANGE ALL PASSWORDS`.
3. Chọn:
   - `Selected accounts`: chỉ chạy account đã tích.
   - `All accounts`: chạy toàn bộ.

Sau khi chạy xong, Chrome automation do Manager mở sẽ tự đóng. Chrome đã mở sẵn trước đó sẽ không bị đóng.

## 7. Kết quả

- Dòng xanh `✓ Done`: đổi mật khẩu thành công.
- Dòng đỏ: có lỗi login, form hoặc Cloudflare.
- Activity Log hiển thị chi tiết từng bước.
- Kết quả được lưu tại:

```text
%LOCALAPPDATA%\AutoAccount\results.json
```

## 8. Lỗi thường gặp

### Không thấy extension

Kiểm tra đã chọn đúng thư mục có `manifest.json` chưa:

```text
%LOCALAPPDATA%\AutoAccount\Extension\AutocaptchaProExtension
```

### Thiếu `SHEET_WEB_APP_URL`

Chạy lại lệnh cấu hình URL trong PowerShell rồi khởi động lại Manager.

### `Account not found`

Apps Script bản mới sẽ tự thêm account chưa có vào Sheet. Hãy kiểm tra đã deploy đúng `New version` chưa.

### Không đổi được mật khẩu

Chạy thử một account trước, kiểm tra Activity Log và không chạy đồng thời quá nhiều account. Nên để `Concurrency = 1` khi kiểm tra lỗi.

## 9. Bảo mật

- Không chia sẻ key AutoCaptchaPro.
- Không chia sẻ URL Web App Google Sheet nếu đang cho phép `Anyone`.
- Không upload `accounts.csv` có mật khẩu thật lên nơi công khai.
- File Google Sheet chứa mật khẩu cần được giới hạn quyền truy cập.
