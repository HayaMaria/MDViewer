@echo off
chcp 65001 >nul
cd /d "c:\Users\Admin\Projects\Robbo\MDViewer\project"

echo Сборка MDViewer (onedir)...
venv\Scripts\pyinstaller --noconfirm MDViewer.spec

echo.
echo Готово! Приложение — в папке dist\MDViewer\
echo   - exe: dist\MDViewer\MDViewer.exe
echo   - раздать: заархивируйте всю папку dist\MDViewer\ в zip
pause