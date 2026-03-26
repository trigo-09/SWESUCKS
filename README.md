# GO-LAH

Full-stack commuter recommendation app built with Django for the backend and React + Tailwind CSS for the frontend.

## What is included

- Email registration, login, email verification OTP, forgot password OTP and guest login
- Local mock Google login flow so the app still works before real Google OAuth keys are added
- First-login profile setup with name, preference mode, walking distance and optional favourite location
- Location autocomplete, validation and reverse geocoding using a local Singapore mock dataset
- Recommendation engine that scores Drive, Taxi and Public Transport
- Recommendation history and favourite locations for authenticated users
- Settings page for profile edits, favourites and password change
- Mock transport data fallback so the app remains runnable before OneMap and LTA integrations are completed

## Project structure

- `backend/` Django API
- `frontend/` React app powered by Vite

## Backend setup

1. Install Python 3.11+.
2. Create and activate a virtual environment inside `backend/`.
3. Install dependencies:

```powershell
cd backend
python -m pip install -r requirements.txt
```

4. Copy `.env.example` to `.env` and fill in optional keys later if needed.
5. Create the database tables:

```powershell
python manage.py makemigrations accounts
python manage.py migrate
```

6. Start the backend:

```powershell
python manage.py runserver
```

## Frontend setup

1. Install dependencies:

```powershell
cd frontend
npm install
```

2. Copy `.env.example` to `.env`.
3. Start the frontend:

```powershell
npm run dev
```

## Notes

- OTP emails use Django console email by default, so verification and reset codes print in the backend terminal during local development.
- Real OneMap, LTA and Google OAuth integrations are intentionally optional for now. If keys are missing, the app runs in mock mode rather than crashing.
- Current transport recommendations use deterministic business logic with mock live data placeholders, making the rest of the product flow testable end to end.
