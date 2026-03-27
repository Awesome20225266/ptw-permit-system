# Zel-EYE: OI — Start Frontend (Vite + React)
# Run from project root

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $rootDir "frontend"
Set-Location $frontendDir

Write-Host "Starting frontend at http://localhost:5173" -ForegroundColor Green
Write-Host "Make sure backend is running at http://localhost:8000" -ForegroundColor Gray
npm run dev
