# Zel-EYE: OI - Start Backend (FastAPI)
$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $rootDir "backend"

if (-not (Test-Path $backendDir)) {
    Write-Error "Backend folder not found: $backendDir"
    exit 1
}
Set-Location $backendDir

$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$useVenv = $false
if (Test-Path $venvPython) {
    & $venvPython -c "import uvicorn" 2>$null | Out-Null
    $useVenv = ($LASTEXITCODE -eq 0)
}
if (-not $useVenv) { Write-Host "Using system Python (venv missing uvicorn). To fix: cd backend; .\.venv\Scripts\pip install -r requirements.txt" -ForegroundColor Yellow }
$pythonCmd = if ($useVenv) { $venvPython } else { "py" }

Write-Host "Starting backend at http://localhost:8000" -ForegroundColor Green
Write-Host "API docs: http://localhost:8000/api/docs" -ForegroundColor Gray

$uvicornArgs = "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000", "--reload-exclude", ".venv/*"
if ($pythonCmd -eq "py") {
    py -3 -m uvicorn @uvicornArgs
} else {
    & $pythonCmd -m uvicorn @uvicornArgs
}
