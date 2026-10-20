@echo off
echo Kiem tra Chrome debug port 9222...
powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:9222/json/version' -UseBasicParsing | Out-Null; Write-Host 'Chrome debug da chay roi!' -ForegroundColor Green } catch { Write-Host 'Dang mo Chrome...' -ForegroundColor Yellow; Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--remote-debugging-port=9222','--user-data-dir=$env:TEMP\chrome-auto','--no-first-run','--no-default-browser-check'; Start-Sleep 3; Write-Host 'Chrome da mo! Co the chay automation.' -ForegroundColor Green }"
echo.
echo Xong! Co the chay: python manager.py
pause
