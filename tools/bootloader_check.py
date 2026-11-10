"""Проверка, что в venv стоит загрузчик PyInstaller, собранный здесь.

tools\build_bootloader.bat собирает загрузчик и вызывает этот скрипт с --save:
отпечаток (SHA-256) сохраняется в venv\custom-bootloader.sha256. build.bat
вызывает скрипт без аргументов: если pip успел вернуть стандартный загрузчик,
отпечаток не совпадёт и сборка остановится.
"""
import hashlib
import sys
from pathlib import Path

import PyInstaller

ROOT = Path(__file__).resolve().parent.parent
MARK = ROOT / 'venv' / 'custom-bootloader.sha256'
BOOTLOADER = Path(PyInstaller.__file__).parent / 'bootloader' / 'Windows-64bit-intel' / 'runw.exe'


def fingerprint():
    return hashlib.sha256(BOOTLOADER.read_bytes()).hexdigest()


def main():
    if '--save' in sys.argv:
        MARK.write_text(fingerprint(), encoding='ascii')
        return 0
    if MARK.is_file() and MARK.read_text(encoding='ascii').strip() == fingerprint():
        return 0
    print('В venv стандартный загрузчик PyInstaller, а не собранный здесь.')
    print('Запустите tools\build_bootloader.bat и повторите сборку.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
