@echo off
title Zel-EYE Frontend
cd /d "%~dp0frontend"
npm run dev
if errorlevel 1 (
    echo.
    echo Frontend failed. Press any key to close.
    pause
)
