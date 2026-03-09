@echo off
title Zel-EYE Backend
cd /d "%~dp0backend"

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -c "import uvicorn" 2>nul
    if errorlevel 1 (
        echo Venv missing deps - using system Python
        py -3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --reload-exclude ".venv"
    ) else (
        ".venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --reload-exclude ".venv"
    )
) else (
    py -3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --reload-exclude ".venv"
)

if errorlevel 1 (
    echo.
    echo Backend failed to start. Press any key to close.
    pause
)
