@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
echo Menutup instansi SyncBoard yang sedang berjalan di tray...
taskkill /F /IM electron.exe >nul 2>&1
timeout /t 1 /nobreak >nul 2>&1
echo Membuka SyncBoard Desktop terbaru...
start "" "%~dp0node_modules\electron\dist\electron.exe" .
