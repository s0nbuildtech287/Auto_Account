# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

ROOT = Path(SPECPATH)
NODE = Path(r"C:\Program Files\nodejs\node.exe")

datas = [
    (str(ROOT / "run.js"), "runtime"),
    (str(ROOT / "changer.js"), "runtime"),
    (str(ROOT / "node_modules"), "runtime/node_modules"),
    (str(ROOT / "Extension"), "runtime/Extension"),
]
binaries = [(str(NODE), "runtime")] if NODE.exists() else []

a = Analysis(
    [str(ROOT / "manager.py")],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="AutoAccount_Setup",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
)
