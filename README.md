# Hello World Auth

**Next.js** frontend → **Gateway** (FastAPI: auth + API gateway) → **Supabase Auth** + **`profiles`**.

Auth design: [docs/design.md](./docs/design.md)

## Architecture

```
Browser → Next.js BFF (/api/*) → Gateway :8000 → Supabase Auth + profiles
```

- Signup / login (email or username) / refresh / password reset
- `GET /hello` — verify JWT, optional refresh, trusted headers
- `GET` / `PATCH /profile` — roles, team, group, plan

## Project structure

```
work/
├── gateway/          main.py, auth.py, profile.py, context.py, claims.py, roles.py
│   └── sql/          profiles migrations + RLS
├── frontend/         app/ (login, signup, profile, dashboard, forgot-password, …)
│   └── lib/          gateway.ts, session.ts, auth.ts
├── docs/design.md
└── README.md
```

## API (gateway)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | — | `{ email, password }` |
| POST | `/auth/login` | — | `{ identifier, password }` — email or username |
| POST | `/auth/refresh` | — | `{ refresh_token }` |
| POST | `/auth/forgot-password` | — | `{ email }` |
| POST | `/auth/reset-password` | — | `{ access_token, password, refresh_token? }` |
| POST | `/auth/change-password` | Bearer | `{ password, refresh_token? }` |
| GET | `/hello` | Bearer (+ optional `X-Refresh-Token`) | Context + `trusted_headers` |
| GET | `/profile` | Bearer | Load profile |
| PATCH | `/profile` | Bearer | Update profile |

## Environment variables

| Variable | Where | Description |
|----------|-------|-------------|
| `FRONTEND_URL` | `gateway/.env` | Password-reset redirect base (e.g. `http://localhost:3000`) |
| `SUPABASE_URL` | `gateway/.env` | Supabase project URL |
| `SUPABASE_ANON_KEY` | `gateway/.env` | Anon / publishable key |
| `SUPABASE_SERVICE_KEY` | `gateway/.env` only | Service role — profiles + username login |
| `JWT_EXPIRY_SECONDS` | `gateway/.env`, `frontend/.env.local` | `3600` (match Supabase Auth JWT expiry) |
| `GATEWAY_URL` | `frontend/.env.local` | `http://localhost:8000` |

Legacy names still work on the gateway: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Copy examples:

```bash
cp gateway/.env.example gateway/.env
cp frontend/.env.local.example frontend/.env.local
```

**Supabase:** Authentication → **JWT expiry** → **3600** s. Add redirect URL: `http://localhost:3000/auth/reset-password`.

## Quick start

```bash
cd gateway && chmod +x run.sh && ./run.sh
# other terminal:
cd frontend && npm run dev
```

1. Sign up / log in (email or username) at http://localhost:3000/login  
2. **Test** (`/dashboard`) — load profile, **GET /hello**  
3. **Profile** — edit username, roles (`user` / `admin`), team, group, plan; change password  
4. **Forgot password** — `/forgot-password` → email link → `/auth/reset-password`

## Supabase `profiles` table

| Column | API / claim |
|--------|-------------|
| `id` | `sub` |
| `email` | `email` |
| `username` | unique, required |
| `roles` | `roles[]` (`user`, `admin`) |
| `team` | `team` |
| `user_group` | `group` |
| `plan` | `plan` |
| `created_at`, `updated_at` | — |

**Profile access** — use one of:

1. **`SUPABASE_SERVICE_KEY`** in `gateway/.env` (recommended; also enables username login), or  
2. Run `gateway/sql/profiles_rls.sql` (RLS for `auth.uid() = id`).

Migrations: `gateway/sql/profiles_role_to_roles.sql`, `gateway/sql/profiles_claims.sql`.

## Manual curl

```bash
# login (email or username as identifier)
RESP=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"you@example.com","password":"yourpass"}')
TOKEN=$(echo "$RESP" | jq -r .access_token)
REFRESH=$(echo "$RESP" | jq -r .refresh_token)

curl -s -H "Authorization: Bearer $TOKEN" \
  -H "X-Refresh-Token: $REFRESH" \
  "http://localhost:8000/hello" | jq

curl -s -X POST http://localhost:8000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}" | jq
```
