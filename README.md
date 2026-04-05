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

- Python 3.11+ with Django installed (`pip install -r requirements.txt`)
- Node.js 18+

## Environment variables

Create `backend/.env` with the following:

```
DJANGO_SECRET_KEY=your-secret-key
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost
FRONTEND_URL=http://localhost:5173

# Email (for OTP)
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your@email.com
EMAIL_HOST_PASSWORD=your-app-password
EMAIL_USE_TLS=true

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# OneMap (Singapore routing)
ONEMAP_EMAIL=your@email.com
ONEMAP_PASSWORD=your-onemap-password

# LTA DataMall (live carpark / taxi / traffic data)
LTA_ACCOUNT_KEY=your-lta-key
```

Create `frontend/.env` with:

```
VITE_API_BASE_URL=http://127.0.0.1:8000/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

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
