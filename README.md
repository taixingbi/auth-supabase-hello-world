# Hello World Auth

**Next.js** frontend → **Gateway** (FastAPI: auth + API gateway).

Auth design details: [docs/design.md](./docs/design.md)

## Architecture

```
Next.js frontend
  ↓  POST /api/auth/login|signup
  ↓  GET /api/hello  +  Authorization: Bearer <jwt>
Gateway (FastAPI, port 8000)
  · signup / login  → Supabase Auth (user DB)
  · GET /hello      → verify JWT, print context, return JSON
```

## Project structure

```
work/
├── gateway/
│   ├── main.py, auth.py, context.py, deps.py, jwt_util.py
│   └── .env.example
├── frontend/
│   ├── lib/gateway.ts, session.ts, auth.ts
│   └── app/api/ + login/ signup/ dashboard/ profile/
├── docs/design.md
└── README.md
```

## API (gateway)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | — | Create user |
| POST | `/auth/login` | — | Returns `access_token`, `refresh_token`, `expires_in`, `user` |
| POST | `/auth/refresh` | — | Body: `{ "refresh_token" }` → new tokens |
| GET | `/hello` | JWT | Print all ids + token, return JSON |
| GET | `/profile` | JWT | Load `profiles` row |
| PATCH | `/profile` | JWT | Update email, username, display_name |

## Environment variables

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `gateway/.env` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `gateway/.env` | Anon key |
| `GATEWAY_URL` | `frontend/.env.local` | `http://localhost:8000` |
| `JWT_EXPIRY_SECONDS` | `gateway/.env` | `3600` (1 hour) |
| `NEXT_PUBLIC_JWT_EXPIRY_SECONDS` | `frontend/.env.local` | `3600` (same as gateway) |

**Supabase:** Dashboard → **Authentication** → **JWT expiry** → set to **3600** seconds (1 hour). Must match `JWT_EXPIRY_SECONDS` in `gateway/.env`.

## Quick start

```bash
# gateway (uses .venv/bin/uvicorn — avoids conda “No module named supabase”)
cd gateway
chmod +x run.sh && ./run.sh

# or manually:
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000

# frontend
cd frontend && npm run dev
```

1. Sign up / log in  
2. Dashboard → **GET /api/hello**  
3. **Profile** at http://localhost:3000/profile — edit email, username, display_name  
4. Dashboard → **GET /api/hello** — see JSON + gateway terminal output

### Supabase `profiles` table

Profile save needs **one** of:

1. **Recommended:** add to `gateway/.env` (never commit, never use in frontend):

   ```env
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

   From Supabase → Project Settings → API → `service_role` secret.

2. **Or** run `gateway/sql/profiles_rls.sql` in the Supabase SQL Editor (RLS policies for `auth.uid() = id`).

### `profiles` columns (Supabase)

| Column | JWT claim |
|--------|-----------|
| `role` | `role` |
| `team` | `team` |
| `user_group` | `group` (API name `group`) |
| — | `plan` → stored in **auth `user_metadata`** (no `plan` column on `profiles`) |

Add **`SUPABASE_SERVICE_ROLE_KEY`** to `gateway/.env` so saving **plan** works (updates `user_metadata`).

Optional SQL: `gateway/sql/profiles_claims.sql` (only if `team` / `user_group` are missing).

## Manual curl

```bash
RESP=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpass"}')
TOKEN=$(echo "$RESP" | jq -r .access_token)
REFRESH=$(echo "$RESP" | jq -r .refresh_token)

curl -H "Authorization: Bearer $TOKEN" "http://localhost:8000/hello"

# refresh when access token expires
curl -s -X POST http://localhost:8000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}" | jq
```
