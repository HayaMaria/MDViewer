@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem Через python -m: запускалки venv\Scripts\*.exe ломаются, если переименовать папку проекта

rem 1. Свой загрузчик PyInstaller (см. tools\build_bootloader.bat)
venv\Scripts\python tools\bootloader_check.py
if errorlevel 1 goto fail

rem 2. Номер версии — из mdviewer\__init__.py
for /f %%v in ('venv\Scripts\python -c "import mdviewer; print(mdviewer.VERSION)"') do set VERSION=%%v
echo Сборка MD Viewer %VERSION%...

rem 3. Программа (onedir) -> dist\MDViewer
venv\Scripts\python -m PyInstaller --noconfirm MDViewer.spec
if errorlevel 1 goto fail

rem 4. Официальный установщик WebView2 (в git не хранится: exe в .gitignore)
set WV2=installer\redist\MicrosoftEdgeWebview2Setup.exe
if not exist %WV2% (
    echo Скачиваю установщик WebView2 с сайта Microsoft...
    powershell -NoProfile -Command "New-Item -ItemType Directory -Force installer\redist | Out-Null; Invoke-WebRequest -UseBasicParsing -Uri https://go.microsoft.com/fwlink/p/?LinkId=2124703 -OutFile %WV2%"
)
rem Подпись Microsoft обязательна: подменённый файл в установщик не попадёт
powershell -NoProfile -Command "$s = Get-AuthenticodeSignature %WV2%; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { exit 1 }"
if errorlevel 1 (
    echo У %WV2% нет действительной подписи Microsoft. Удалите файл и повторите сборку.
    goto fail
)

rem 5. Установщик -> dist\MDViewer-<версия>-setup.exe
set ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe
if not exist "%ISCC%" set ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe
if not exist "%ISCC%" (
    echo Не найден Inno Setup 6: установщик не собран. winget install JRSoftware.InnoSetup
    goto fail
)
rem Собираем вне dist и потом переносим: если dist открыта в Проводнике, он читает
rem иконку недописанного exe, и Inno Setup падает с «EndUpdateResource failed»
"%ISCC%" /Q /DAppVersion=%VERSION% /O"build\installer" installer\MDViewer.iss
if errorlevel 1 goto fail
move /y "build\installer\MDViewer-%VERSION%-setup.exe" dist\ >nul
if errorlevel 1 goto fail

echo.
echo Готово!
echo   - установщик: dist\MDViewer-%VERSION%-setup.exe
echo   - программа без установки: dist\MDViewer\MDViewer.exe
echo.
echo Если менялся код в cm-builder\src, перед сборкой выполните: cd cm-builder ^&^& npm run build
pause
exit /b 0

:fail
echo.
echo СБОРКА ПРЕРВАНА.
pause
exit /b 1
