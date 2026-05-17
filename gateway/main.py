from fastapi import Depends, FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

from auth import login, refresh_session, resolve_hello_tokens, signup, verify_jwt
from claims import UserClaims
from context import build_hello_response
from deps import parse_bearer
from profile import ProfileUpdate, get_profile, update_profile

app = FastAPI(title="Gateway", description="Auth + API gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AuthBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class RefreshBody(BaseModel):
    refresh_token: str = Field(min_length=1)


def _token_from_claims(
    authorization: str | None = Header(default=None),
) -> tuple[str, UserClaims]:
    token = parse_bearer(authorization)
    return token, verify_jwt(token)


@app.post("/auth/signup")
def auth_signup(body: AuthBody):
    return signup(body.email, body.password)


@app.post("/auth/login")
def auth_login(body: AuthBody):
    return login(body.email, body.password)


@app.post("/auth/refresh")
def auth_refresh(body: RefreshBody):
    return refresh_session(body.refresh_token)


@app.get("/hello")
def hello(
    authorization: str | None = Header(default=None),
    x_refresh_token: str | None = Header(default=None, alias="X-Refresh-Token"),
    session_id: str | None = None,
    conversation_id: str | None = None,
    request_id: str | None = None,
    trace_id: str | None = None,
):
    access_sent = parse_bearer(authorization)
    access_sent, access_active, refreshed, oauth_refresh = resolve_hello_tokens(
        access_sent, x_refresh_token
    )
    claims = verify_jwt(access_active)
    return build_hello_response(
        access_sent=access_sent,
        access_active=access_active,
        claims=claims,
        refreshed=refreshed,
        oauth_refresh=oauth_refresh,
        session_id=session_id,
        conversation_id=conversation_id,
        request_id=request_id,
        trace_id=trace_id,
    )


@app.get("/profile")
def profile_get(auth: tuple[str, UserClaims] = Depends(_token_from_claims)):
    token, claims = auth
    return get_profile(token, claims)


@app.patch("/profile")
def profile_patch(
    body: ProfileUpdate,
    auth: tuple[str, UserClaims] = Depends(_token_from_claims),
):
    token, claims = auth
    return update_profile(token, claims, body)
