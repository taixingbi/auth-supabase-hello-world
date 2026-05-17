from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

from auth import login, refresh_session, signup, verify_jwt
from context import build_hello_response, should_refresh_jwt
from profile import ProfileUpdate, get_profile, update_profile

load_dotenv()

app = FastAPI(
    title="Gateway",
    description="Signup, login, JWT verify, GET /hello",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header",
        )
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty bearer token")
    return token


class AuthBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class RefreshBody(BaseModel):
    refresh_token: str = Field(min_length=1)


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
    """Print token + fresh_token; refresh only when JWT is expired/near expiry."""
    token = parse_bearer(authorization)
    fresh_token = token
    did_refresh = False
    refresh_payload: dict | None = None

    if should_refresh_jwt(token):
        if not x_refresh_token or not x_refresh_token.strip():
            raise HTTPException(
                status_code=401,
                detail="Access token expired; send X-Refresh-Token",
            )
        refresh_payload = refresh_session(x_refresh_token.strip())
        fresh_token = refresh_payload["access_token"]
        did_refresh = True

    claims = verify_jwt(fresh_token)

    response = build_hello_response(
        token=token,
        fresh_token=fresh_token,
        claims=claims,
        refreshed=did_refresh,
        session_id=session_id,
        conversation_id=conversation_id,
        request_id=request_id,
        trace_id=trace_id,
    )
    if refresh_payload and refresh_payload.get("refresh_token"):
        response["refresh_token"] = refresh_payload["refresh_token"]
    return response


@app.get("/profile")
def profile_get(authorization: str | None = Header(default=None)):
    token = parse_bearer(authorization)
    claims = verify_jwt(token)
    return get_profile(token, claims)


@app.patch("/profile")
def profile_patch(
    body: ProfileUpdate,
    authorization: str | None = Header(default=None),
):
    token = parse_bearer(authorization)
    claims = verify_jwt(token)
    return update_profile(token, claims, body)
