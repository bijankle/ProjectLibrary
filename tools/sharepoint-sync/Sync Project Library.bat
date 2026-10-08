@echo off
rem Double-click to run the sync. Add  -DryRun  after the .ps1 name to see what it would upload without uploading.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Sync-ProjectLibrary.ps1" %*
pause
