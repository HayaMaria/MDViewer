"""Пути к ресурсам приложения (одинаково для исходников и сборки PyInstaller)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENTRY_SCRIPT = ROOT / 'app.py'
ICON_PATH = ROOT / 'icon.ico'

ASSETS_DIR = ROOT / 'assets'
INDEX_HTML = ASSETS_DIR / 'index.html'
CSS_DIR = ASSETS_DIR / 'css'
LIB_DIR = ASSETS_DIR / 'lib'
BUILD_DIR = ASSETS_DIR / 'build'
MERMAID_THEMES = ASSETS_DIR / 'mermaid-themes.json'
