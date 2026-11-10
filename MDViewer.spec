# -*- mode: python ; coding: utf-8 -*-
import os
from pathlib import Path

root = Path(os.getcwd())

# ===== Свойства exe (Проводник → Свойства → Подробно) =====
# Номер версии берётся из mdviewer/__init__.py, чтобы он был в одном месте.
# Файл без этих сведений антивирусы считают подозрительнее.
import re
from PyInstaller.utils.win32.versioninfo import (
    VSVersionInfo, FixedFileInfo, StringFileInfo, StringTable, StringStruct,
    VarFileInfo, VarStruct)

_meta = (root / 'mdviewer' / '__init__.py').read_text(encoding='utf-8')
def _const(name):
    return re.search(rf"^{name} = '([^']*)'", _meta, re.M).group(1)

APP_TITLE = _const('APP_TITLE')
VERSION = _const('VERSION')
AUTHOR = _const('AUTHOR')
_numbers = tuple((list(map(int, VERSION.split('.'))) + [0, 0, 0, 0])[:4])

version_info = VSVersionInfo(
    ffi=FixedFileInfo(filevers=_numbers, prodvers=_numbers),
    kids=[
        StringFileInfo([StringTable('041904B0', [  # русский, Unicode
            StringStruct('CompanyName', AUTHOR),
            StringStruct('FileDescription', APP_TITLE + ' — редактор Markdown'),
            StringStruct('FileVersion', VERSION),
            StringStruct('InternalName', 'MDViewer'),
            StringStruct('LegalCopyright', f'© 2026 {AUTHOR}'),
            StringStruct('OriginalFilename', 'MDViewer.exe'),
            StringStruct('ProductName', APP_TITLE),
            StringStruct('ProductVersion', VERSION),
        ])]),
        VarFileInfo([VarStruct('Translation', [0x0419, 1200])]),
    ],
)

a = Analysis(
    ['app.py'],
    pathex=[str(root)],
    binaries=[],
    datas=[
        (str(root / 'assets'), 'assets'),
        (str(root / 'icon.ico'), '.'),
    ],
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
    [],
    exclude_binaries=True,
    name='MDViewer',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=True,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(root / 'icon.ico'),
    version=version_info,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='MDViewer',
)