# Zel-EYE: OI — How to Run

## Quick start (double-click)

1. **Double-click `start-backend.bat`** — starts the API at http://localhost:8000
2. **Double-click `start-frontend.bat`** — starts the app at http://localhost:5173
3. Open **http://localhost:5173** in your browser

Keep both windows open. Start the backend first.

---

## Alternative: PowerShell (from project root)

```powershell
.\start-backend.ps1   # Terminal 1
.\start-frontend.ps1  # Terminal 2
```

---

## Manual commands

**Backend:**
```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```powershell
cd frontend
npm run dev
```

---

## Ports

- Backend: 8000
- Frontend: 5173 (Vite may use 5174 if 5173 is busy)

## Secrets

The backend reads from `secrets.toml` in the project root. No .env needed.
