@echo off
setlocal
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "PROFILE=C:\tmp\chrome-auto-9333"
set "PORT=9333"

echo Kiem tra Chrome debug port %PORT%...
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT%/json/version' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto ready

echo Dang mo Chrome profile automation...
start "" "%CHROME%" --remote-debugging-port=%PORT% --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check
timeout /t 5 /nobreak >nul

powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT%/json/version' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo LOI: Chrome khong mo duoc CDP port %PORT%.
  echo Kiem tra Chrome path va profile: %PROFILE%
  goto end
)

:ready
echo Chrome debug da san sang tren port %PORT%.
echo Profile: %PROFILE%
echo Co the load extension tai chrome://extensions.
echo Sau do chay: python manager.py

:end
pause
