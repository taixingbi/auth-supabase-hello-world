# Auth design

Authentication for **Next.js** (BFF) + **Gateway** (FastAPI) + **Supabase Auth**.

## Goals

- **Single trust boundary:** browser → gateway with a Supabase access JWT; gateway verifies and owns identity.
- **No Supabase SDK in the browser** for auth — credentials and tokens flow through the Next.js BFF to the gateway.
- **Production pattern:** gateway derives **trusted headers** from verified JWT + `profiles` for downstream services.

## Architecture

```
┌─────────────┐   /api/auth/*, /api/hello, /api/profile   ┌─────────────────┐
│   Next.js   │ ──────────────────────────────────────────► │ Gateway :8000   │
│  (browser)  │   Authorization: Bearer <access_jwt>        │ FastAPI         │
└─────────────┘   X-Refresh-Token (hello only, optional)    └────────┬────────┘
                                                                       │
                    signup · login · refresh · password · verify       ▼
                                                              ┌─────────────────┐
                                                              │ Supabase Auth   │
                                                              │ + profiles DB   │
                                                              └─────────────────┘

Future: Gateway ──trusted headers──► orchestrator ──► RAG / LLM
```

| Layer | Responsibility |
|-------|----------------|
| **Next.js** | UI, BFF routes, `localStorage` session |
| **Gateway** | Auth, JWT verify, profile CRUD, trusted headers, hello context |
| **Supabase** | `auth.users`, passwords, JWT issuance; `profiles` for app claims |

## Trust boundaries

### Browser → Gateway

Send only:

```http
Authorization: Bearer <access_token>
```

Optional on `GET /hello`:

```http
X-Refresh-Token: <opaque_refresh_token>
```

Optional query: `session_id`, `conversation_id`, `request_id`, `trace_id`.

Do **not** send `X-User-*` from the browser — the gateway sets those after verification.

### Gateway → Downstream

After `verify_jwt`, the gateway may attach:

| Header | Value |
|--------|--------|
| `Authorization` | `Bearer <active_access_jwt>` |
| `X-User-Id` | `sub` / user id |
| `X-User-Email` | email |
| `X-User-Roles` | comma-separated roles (e.g. `user,admin`) |
| `X-User-Team` | team |
| `X-User-Group` | group (from `profiles.user_group`) |
| `X-User-Plan` | plan |
| `X-Session-Id` | `sess_*` |
| `X-Conversation-Id` | `conv_*` |
| `X-Request-Id` | `req_*` |
| `X-Trace-Id` | `trace_*` |

Downstream must trust these **only from the gateway**, not from the public internet.

## Application claims (`jwt_claims`)

Built from `profiles` (+ `auth.users` metadata fallback). Returned on login, refresh, and `/hello`.

```json
{
  "sub": "uuid",
  "email": "user@example.com",
  "roles": ["user"],
  "team": "ai-platform",
  "group": "engineering",
  "plan": "free"
}
```

| Field | Source |
|-------|--------|
| `sub` | `profiles.id` |
| `email` | `profiles.email` |
| `roles` | `profiles.roles` (`text[]`, allowed: `user`, `admin`) |
| `team` | `profiles.team` |
| `group` | `profiles.user_group` |
| `plan` | `profiles.plan` |

Claims are also mirrored to `auth.users.user_metadata` on profile save (for consistency). The **Supabase access JWT** remains the signed token in `Authorization`; custom fields are enforced at the gateway from the database.

### `profiles` table

| Column | Notes |
|--------|--------|
| `id` | uuid, PK, matches `auth.users.id` |
| `email` | text |
| `username` | text, NOT NULL, unique — auto-set on first profile create |
| `display_name` | text, optional |
| `roles` | `text[]`, default `{user}` |
| `plan` | text |
| `team` | text |
| `user_group` | text (API field name: `group`) |
| `created_at`, `updated_at` | timestamptz |

Migrations: `gateway/sql/profiles_role_to_roles.sql`, `gateway/sql/profiles_claims.sql`, `gateway/sql/profiles_rls.sql`.

## Auth flows

### Signup

`POST /api/auth/signup` → `POST /auth/signup` → `auth.sign_up` → tokens + `user` (profile created on first `/profile` or `/hello` access).

### Login (email or username)

`POST /api/auth/login` with `{ "identifier": "email or username", "password" }` (legacy `{ "email" }` still accepted).

- Contains `@` → treat as email → `sign_in_with_password`.
- Otherwise → lookup `profiles.email` by `username` (requires `SUPABASE_SERVICE_KEY` on gateway) → sign in with that email.

### Refresh

`POST /api/auth/refresh` with `{ "refresh_token" }` → new access JWT + user payload.

### Forgot / reset password

1. `POST /auth/forgot-password` `{ "email" }` → Supabase sends email.
2. Link opens `{FRONTEND_URL}/auth/reset-password#access_token=...&type=recovery`.
3. `POST /auth/reset-password` `{ "access_token", "password", "refresh_token"? }` → new password; may return session.

**Supabase:** add `http://localhost:3000/auth/reset-password` to Auth → URL configuration. Set `FRONTEND_URL` in `gateway/.env`.

### Change password (logged in)

`POST /auth/change-password` + `Authorization` + `{ "password", "refresh_token"? }` → updates password; refreshes session if refresh token sent.

### GET /hello

1. Verify bearer JWT (token sent by client).
2. If `X-Refresh-Token` present → refresh session → `refreshed: true`, new `fresh_token`.
3. Load claims, print context to gateway console, return JSON + `trusted_headers`.

## API reference (gateway)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/signup` | — | `{ email, password }` |
| `POST` | `/auth/login` | — | `{ identifier, password }` or `{ email, password }` |
| `POST` | `/auth/refresh` | — | `{ refresh_token }` |
| `POST` | `/auth/forgot-password` | — | `{ email }` |
| `POST` | `/auth/reset-password` | — | `{ access_token, password, refresh_token? }` |
| `POST` | `/auth/change-password` | Bearer | `{ password, refresh_token? }` |
| `GET` | `/hello` | Bearer (+ optional `X-Refresh-Token`) | Verify / refresh, context + trusted headers |
| `GET` | `/profile` | Bearer | Load profile row |
| `PATCH` | `/profile` | Bearer | Update profile fields |

### Login response (example)

```json
{
  "access_token": "eyJ…",
  "refresh_token": "opaque_short_string",
  "expires_in": 3600,
  "expires_at": "2026-05-17 12:00:00 EST",
  "jwt_claims": { "sub": "…", "email": "…", "roles": ["user"], "team": "…", "group": "…", "plan": "free" },
  "user": { "user_id": "…", "email": "…", "roles": ["user"], "team": "…", "group": "…", "plan": "free", "jwt_claims": { … } }
}
```

### GET /hello response (key fields)

```json
{
  "message": "Hello user@example.com",
  "roles": ["user"],
  "jwt_claims": { … },
  "token": "<jwt_sent>",
  "fresh_token": "<active_jwt>",
  "refreshed": true,
  "refresh_token": "<opaque>",
  "trusted_headers": { "X-User-Roles": "user", … },
  "session_id": "sess_…",
  "expires_at": "… EST",
  "expires_in": 3600
}
```

## Token shapes

| Token | Form | Notes |
|-------|------|--------|
| **Access** | JWT (`eyJ…`) | `Authorization: Bearer`; stored as `access_token` |
| **Refresh** | Opaque, often short | **Not a JWT**; only for `/auth/refresh` or `X-Refresh-Token` on `/hello` |

Never store `refresh_token` equal to `access_token`.

## Frontend session (`localStorage`)

| Key | Content |
|-----|---------|
| `access_token` | Supabase access JWT |
| `refresh_token` | Opaque refresh token |
| `auth_user` | `{ user_id, email, roles[], team, group, plan, jwt_claims? }` |
| `token_expires_at` | Unix expiry (refresh ~60s before) |

Pages: `/login`, `/signup`, `/forgot-password`, `/auth/reset-password`, `/profile`, `/dashboard` (UI label **Test**).

## Code map

| Area | Files |
|------|--------|
| Gateway routes | `gateway/main.py` |
| Auth | `gateway/auth.py` |
| Claims / roles | `gateway/claims.py`, `gateway/roles.py` |
| Hello / headers | `gateway/context.py` |
| Profiles | `gateway/profile.py` |
| Metadata sync | `gateway/user_meta.py` |
| Supabase client | `gateway/supabase_client.py` |
| BFF | `frontend/app/api/**/route.ts`, `frontend/lib/gateway.ts` |
| Session | `frontend/lib/session.ts`, `frontend/lib/auth.ts` |
| UI | `frontend/app/login`, `profile`, `dashboard`, `forgot-password`, `auth/reset-password` |

## Configuration

**`gateway/.env`:**

```env
FRONTEND_URL=http://localhost:3000
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-or-publishable-key>
JWT_EXPIRY_SECONDS=3600
SUPABASE_SERVICE_KEY=<service_role-secret>   # profiles RLS bypass + username login lookup
```

Legacy names still work: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

**`frontend/.env.local`:**

```env
GATEWAY_URL=http://localhost:8000
SUPABASE_URL=…          # same as gateway (optional; BFF uses gateway only)
SUPABASE_ANON_KEY=…
JWT_EXPIRY_SECONDS=3600
```

Match **JWT expiry** with Supabase Dashboard → Authentication → JWT expiry (e.g. 3600s).

## Security

- **Anon key** on gateway only; **service role** only in `gateway/.env`, never in the browser.
- Restrict CORS in production (`allow_origins`).
- Verify JWT on every protected route before setting `X-User-*`.
- Username login and profile writes need service key or correct RLS (`profiles_rls.sql`).
- Do not log full JWTs in production (hello prints tokens in dev only).
- Password reset redirect URL must be allowlisted in Supabase.

## Local development

```bash
# Terminal 1
cd gateway && ./run.sh

# Terminal 2
cd frontend && npm run dev
```

1. Supabase → Authentication → disable **Confirm email** (optional, for faster dev).
2. Add redirect URL: `http://localhost:3000/auth/reset-password`.
3. Restart both processes after `.env` changes.

## Evolution

| Phase | Status |
|-------|--------|
| Gateway auth + profiles + `/hello` + refresh | Done |
| Email/username login, password reset, profile roles | Done |
| Gateway `POST /chat` → orchestrator + `trusted_headers` | Next |
| httpOnly cookies, service-to-service auth | Later |

**Frontend sends JWT; gateway verifies and forwards trusted identity.**
