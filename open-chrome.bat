@echo off
echo Dang mo Chrome voi remote debugging...
echo Sau khi Chrome mo, chay: node capture.js hoac node run.js
echo.
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%TEMP%\chrome-automation" ^
  --no-first-run ^
  --no-default-browser-check
echo Chrome da mo voi debug port 9222
pause
