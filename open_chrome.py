# -*- coding: utf-8 -*-
"""
open_chrome.py — Mo Chrome voi remote debugging port 9222
Chay: python open_chrome.py
"""
import subprocess
import sys
import time
import os

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
USER_DATA   = os.path.join(os.environ.get("TEMP", r"C:\Temp"), "chrome-auto")
DEBUG_PORT  = 9222

def is_chrome_running():
    try:
        import urllib.request
        urllib.request.urlopen(f"http://localhost:{DEBUG_PORT}/json/version", timeout=2)
        return True
    except:
        return False

def main():
    print("=" * 50)
    print("  Chrome Remote Debug Launcher")
    print("=" * 50)

    if is_chrome_running():
        print(f"\n[OK] Chrome debug da chay tren port {DEBUG_PORT}!")
        print("     Co the chay automation ngay.")
    else:
        print(f"\n[...] Dang mo Chrome tren port {DEBUG_PORT}...")
        try:
            subprocess.Popen([
                CHROME_PATH,
                f"--remote-debugging-port={DEBUG_PORT}",
                f"--user-data-dir={USER_DATA}",
                "--no-first-run",
                "--no-default-browser-check",
            ])
            # Cho Chrome khoi dong
            for i in range(8):
                time.sleep(1)
                if is_chrome_running():
                    print(f"[OK] Chrome da san sang sau {i+1}s!")
                    break
                print(f"     Dang cho... ({i+1}s)")
            else:
                print("[WARN] Chrome mo roi nhung chua detect duoc port.")
                print("       Thu chay automation xem co OK khong.")
        except FileNotFoundError:
            print(f"[ERR] Khong tim thay Chrome tai:\n      {CHROME_PATH}")
            sys.exit(1)

    print()
    print("Buoc tiep theo:")
    print("  python manager.py")
    print()
    input("Bam Enter de thoat...")

if __name__ == "__main__":
    main()
