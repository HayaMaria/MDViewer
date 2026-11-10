@echo off
chcp 65001 >nul
cd /d "%~dp0.."

rem Собрать загрузчик PyInstaller из исходников на этом компьютере.
rem Стандартный загрузчик из pip одинаковый у всех (в том числе у вирусов),
rem поэтому антивирусы иногда ругаются на любой exe с ним. Свой — уникален.
rem
rem Нужно: Microsoft C++ Build Tools (рабочая нагрузка «Разработка классических
rem приложений на C++»). Запускать заново после каждой переустановки PyInstaller
rem (например, после pip install -r requirements-dev.txt).

for /f "tokens=2 delims==" %%v in ('findstr /b "pyinstaller==" requirements-dev.txt') do set PYI_VERSION=%%v
echo Сборка загрузчика PyInstaller %PYI_VERSION% из исходников...

set PYINSTALLER_COMPILE_BOOTLOADER=1
venv\Scripts\python -m pip install --force-reinstall --no-deps --no-cache-dir --no-binary pyinstaller pyinstaller==%PYI_VERSION%
if errorlevel 1 (
    echo.
    echo ОШИБКА: загрузчик не собрался. Установлены ли C++ Build Tools?
    pause
    exit /b 1
)

rem Запоминаем отпечаток нового загрузчика: build.bat сверяет его перед сборкой
venv\Scripts\python tools\bootloader_check.py --save
echo.
echo Готово: свой загрузчик установлен.
pause
