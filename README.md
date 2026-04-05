# GO-LAH

Full-stack commuter recommendation app built with Django for the backend and React + Tailwind CSS for the frontend.

## What is included

- Email registration, login, Google login, email verification OTP, forgot password OTP and guest login
- First-login profile setup with name, preference mode, walking distance and optional favourite location
- Location autocomplete, validation and reverse geocoding using a local Singapore dataset via onemap
- Recommendation engine that scores Drive, Taxi and Public Transport
- Recommendation history and favourite locations for authenticated users
- Settings page for profile edits, favourites and password change


## Project structure

- `backend/` Django API
- `frontend/` React app powered by Vite

## Backend setup

1. Install Python 3.11+.
2. Create and activate a virtual environment inside `backend/`.
3. Install dependencies:

```powershell
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
cd frontend && npm install
npm install lucide-react @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

2. Copy `.env.example` to `.env`.
3. Start the frontend:

```powershell
npm run dev
```
