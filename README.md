# GO-LAH

Full-stack commuter recommendation app built with Django for the backend and React + Tailwind CSS for the frontend.

## What is included

- Email registration, login, Google OAuth, email verification OTP, forgot/reset password and guest login
- First-login profile setup with name, preference mode, walking distance and optional favourite location
- Location autocomplete, validation, reverse geocoding and route preview via OneMap
- Recommendation engine that scores Drive, Taxi and Public Transport using live LTA and weather data
- Multi-stop trip support with per-leg recommendations aggregated into one overall recommendation
- Recommendation history and favourite locations for authenticated users
- Settings page for profile edits, favourites and password change
- API documentation at `/api/docs/`

## Project structure

```
CODEE/
├── backend/      Django REST API
├── frontend/     React app powered by Vite
├── requirements.txt
└── start.sh      Single command to run everything
```

## Quick start

This is the only command you need:

```bash
./start.sh
```

The script will:
1. Detect your Python installation automatically
2. Install frontend dependencies if missing
3. Apply any pending database migrations
4. Start both servers concurrently

| Service  | URL                            |
|----------|--------------------------------|
| Frontend | http://localhost:5173          |
| Backend  | http://127.0.0.1:8000          |
| API Docs | http://127.0.0.1:8000/api/docs/ |

Press `Ctrl+C` to stop both servers.

## Prerequisites

- Python 3.11+ with Django installed 
- Node.js 18+  
`pip install -r requirements.txt`


## Manual setup (if not using start.sh)

**Backend:**
```bash
cd backend
pip install -r ../requirements.txt
python manage.py migrate
python manage.py runserver
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```
