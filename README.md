# Omnivest

Smallcase-style investing platform: model portfolios published by research analysts,
admin approval workflow, AIF/Advisory lead capture, phone-OTP auth, Zerodha Kite broker
integration. React + FastAPI + MongoDB. See `memory/PRD.md` for full product history.

## Local development (Windows)

Prerequisites (installed per-user, no admin needed): Python 3.12, Node.js 24 + yarn
(`%LOCALAPPDATA%\Programs\nodejs`), MongoDB 8.3 (`%LOCALAPPDATA%\Programs\mongodb-win32-x86_64-windows-8.3.7`).

Three processes:

```powershell
# 1. MongoDB
& "$env:LOCALAPPDATA\Programs\mongodb-win32-x86_64-windows-8.3.7\bin\mongod.exe" --dbpath "$env:LOCALAPPDATA\OmnivestData\db" --port 27017 --bind_ip 127.0.0.1

# 2. Backend (from backend/) — http://localhost:8000
.\.venv\Scripts\python.exe -m uvicorn server:app --port 8000 --reload

# 3. Frontend (from frontend/) — http://localhost:3000
yarn start
```

Config lives in `backend/.env` (Mongo URL, JWT secret, Twilio, Kite; OTP runs in demo
mode with code `123456`) and `frontend/.env` (`REACT_APP_BACKEND_URL`). Neither is
committed. On first backend start, admin/demo users, default content and FAQs are
seeded automatically.

- Admin console: log in at `/login` with `admin@omnivest.in` / `Admin@123`, then `/admin`.
- Investor/analyst auth: phone + OTP modal (demo code `123456`).

Uploads (factsheet PDFs, About-page images) are stored on local disk under
`backend/uploads/` (`storage.py`); swap that module for S3/R2 when deploying.

## Tests

```powershell
# from backend/ with the backend running
.\.venv\Scripts\python.exe -m pytest tests -q
```

## History

Originally built on the Emergent platform ("Basketly", later rebranded Omnivest);
migrated to a self-hosted setup Aug 2026. Emergent object storage, analytics and
platform scripts were removed at that point.
