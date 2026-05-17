# Auth design

Authentication for **Next.js** + **Gateway** (FastAPI) + **Supabase Auth**.

## Goals

- **Single trust boundary:** the browser talks to the **gateway** with a JWT; the gateway verifies it and owns identity.
- **No Supabase in the browser** for login/signup — credentials go to the gateway only.
- **Production-ready pattern:** frontend sends JWT; gateway derives trusted headers for downstream services (orchestrator, RAG, LLM).

## High-level architecture

```
┌─────────────┐     POST /api/auth/*      ┌──────────────────┐
│   Next.js   │ ────────────────────────► │     Gateway      │
│  (browser)  │     GET /api/hello        │  (FastAPI :8000) │
│             │     Authorization: Bearer │                  │
└─────────────┘                           └────────┬─────────┘
                                                   │
                                                   │ signup / login / verify
                                                   ▼
                                          ┌──────────────────┐
                                          │  Supabase Auth   │
                                          │  (auth.users)    │
                                          └──────────────────┘

Future:

┌──────────────────┐     trusted headers    ┌──────────────┐     ┌─────────┐
│     Gateway      │ ─────────────────────► │ orchestrator │ ──► │ RAG/LLM │
└──────────────────┘                        └──────────────┘     └─────────┘
```

## Roles of each layer

| Layer | Responsibility |
|-------|----------------|
| **Next.js** | UI, BFF (`/api/auth/*`, `/api/hello`), JWT in `localStorage` |
| **Gateway** | Signup, login, JWT verification, request context, trusted headers |
| **Supabase** | User store, passwords, JWT issuance |

The **gateway** is both **auth service** and **API gateway / BFF** for protected routes.

## Trust boundaries

### Rule 1: Frontend → Gateway

The browser sends **only**:

```http
Authorization: Bearer <access_token>
```

Optional query params on `GET /hello`: `session_id`, `request_id`, `trace_id`, `conversation_id`.

The frontend must **not** send `X-User-*` headers — the gateway sets those after JWT verification.

### Rule 2: Gateway → Downstream (orchestrator)

After verifying the JWT, the gateway may forward:

```http
Authorization: Bearer <jwt>
X-User-Id: <sub / user_id>
X-User-Email: user@example.com
X-User-Roles: user
X-Session-Id: sess_...
X-Conversation-Id: conv_...
X-Request-Id: req_...
X-Trace-Id: trace_...
```

Downstream services should **trust these headers only from the gateway network**, not from the public internet.

## JWT and claims

| Field | Meaning | Notes |
|-------|---------|--------|
| `sub` | `user_id` | Stable user id |
| `email` | User email | From Supabase |
| `roles` | Permissions | Default `["user"]`; `app_metadata.roles` |

```json
{
  "sub": "f5d6a098-ba81-4c31-acdd-6da743d1325e",
  "email": "test@example.com",
  "roles": ["user"]
}
```

Tokens stay in the **`Authorization` header**, not the request body.

## Auth flows

### Signup

```
Browser  POST /api/auth/signup
    →  Next BFF  POST {GATEWAY_URL}/auth/signup
    →  Supabase  auth.sign_up
    ←  { access_token?, user, email_confirmation_required? }
```

### Login

```
Browser  POST /api/auth/login
    →  Next BFF  POST {GATEWAY_URL}/auth/login
    →  Supabase  auth.sign_in_with_password
    ←  { access_token, user: { user_id, email, roles } }
```

### Protected request (GET /hello)

```
Browser  GET /api/hello  Authorization: Bearer <jwt>
    →  Next BFF  GET {GATEWAY_URL}/hello
    →  Gateway  verify_jwt → print context → JSON response
```

Gateway **prints** to the server console:

```
[hello] context:
  session_id:      sess_...
  request_id:      req_...
  trace_id:        trace_...
  conversation_id: conv_...
  token:           <jwt>
```

## API reference (gateway)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/signup` | No | Create user |
| `POST` | `/auth/login` | No | Return JWT + user |
| `GET` | `/hello` | Bearer JWT | Verify token, print context |
| `GET` | `/profile` | Bearer JWT | Load `profiles` from DB |
| `PATCH` | `/profile` | Bearer JWT | Update email, username, display_name |

### Login response

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "user": {
    "user_id": "uuid",
    "email": "test@example.com",
    "roles": ["user"]
  }
}
```

### GET /hello response

```json
{
  "message": "Hello test@example.com",
  "user_id": "uuid",
  "email": "test@example.com",
  "roles": ["user"],
  "session_id": "sess_abc",
  "request_id": "req_def",
  "trace_id": "trace_ghi",
  "conversation_id": "conv_jkl",
  "token": "<jwt>",
  "trusted_headers": { ... }
}
```

## Token shapes (Supabase Auth)

| Token | Typical form | Length | Used for |
|-------|----------------|--------|----------|
| **Access** (`access_token`, `token`, `fresh_token`) | JWT (`eyJ…`, 3 dot-separated parts) | ~500–2000+ chars | `Authorization: Bearer` on API calls |
| **Refresh** (`refresh_token`) | Opaque string (not a JWT) | Often **short** (e.g. 12 chars) | Only `POST /auth/refresh` or `X-Refresh-Token` on `/hello` |

A short `refresh_token` like `vn2w6japr54m` is **normal** — Supabase issues compact opaque refresh tokens, not JWTs. Do not compare its length to the access JWT.

## Frontend session storage

| Key | Content |
|-----|---------|
| `access_token` | Supabase access JWT |
| `refresh_token` | Supabase opaque refresh token (short is OK) |
| `auth_user` | `{ user_id, email, roles }` |
| `token_expires_at` | Unix time when access JWT should be refreshed |

## Code map

| File | Purpose |
|------|---------|
| `gateway/auth.py` | Supabase client, signup, login, `verify_jwt` |
| `gateway/context.py` | Ids, `trusted_headers`, `print_context`, hello response |
| `gateway/main.py` | FastAPI routes, CORS |
| `gateway/profile.py` | CRUD for `profiles` table |
| `frontend/app/profile/page.tsx` | Profile edit UI |
| `frontend/lib/session.ts` | Token + user in `localStorage` |
| `frontend/app/api/auth/*/route.ts` | BFF → gateway auth |
| `frontend/app/api/hello/route.ts` | BFF → gateway GET /hello |

## Configuration

**`gateway/.env`:**

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

**`frontend/.env.local`:**

```env
GATEWAY_URL=http://localhost:8000
```

Only the **gateway** calls Supabase at runtime. The Next.js BFF proxies to `GATEWAY_URL`.

## Security notes

- Use Supabase **anon** key on the gateway; never **service role** in the browser.
- Restrict CORS in production.
- Validate JWT on every protected route before setting `X-User-*` headers.
- Do not log JWTs in production; hello-world prints to the dev console only.

## Local development

1. Disable Supabase **Confirm email** for easier login.
2. Do not overwrite `frontend/.env.local` with placeholders.
3. Restart `npm run dev` after env changes; restart `uvicorn` after `gateway/.env` changes.

```bash
cd gateway && uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Evolution path

| Phase | Change |
|-------|--------|
| **Now** | Gateway + Supabase JWT + GET `/hello` |
| **Next** | Gateway `POST /chat` → orchestrator with `trusted_headers` |
| **Later** | Refresh tokens, httpOnly cookies, service auth to orchestrator |

**Frontend sends JWT; gateway verifies and forwards trusted identity.**
