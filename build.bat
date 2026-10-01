@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Сборка MDViewer (onedir)...
venv\Scripts\pyinstaller --noconfirm MDViewer.spec

echo.
echo Готово! Приложение — в папке dist\MDViewer\
echo   - exe: dist\MDViewer\MDViewer.exe
echo   - раздать: заархивируйте всю папку dist\MDViewer\ в zip
echo.
echo Если менялся код в cm-builder\src, перед сборкой выполните: cd cm-builder ^&^& npm run build
pause
