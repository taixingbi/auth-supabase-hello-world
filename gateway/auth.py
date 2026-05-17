import os
from dataclasses import dataclass

from dotenv import load_dotenv
from fastapi import HTTPException
from supabase import Client, create_client

from config import JWT_EXPIRY_SECONDS
from time_util import format_unix_est

load_dotenv()

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    raise RuntimeError(
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in gateway/.env"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

supabase_admin: Client | None = None
if SUPABASE_SERVICE_ROLE_KEY:
    supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


@dataclass
class UserClaims:
    """JWT claims (Supabase access token)."""

    user_id: str  # sub
    email: str | None
    roles: list[str]


def default_roles(app_metadata: dict | None) -> list[str]:
    if app_metadata and isinstance(app_metadata.get("roles"), list):
        return app_metadata["roles"]
    return ["user"]


def roles_from_profile_role(role: str | None, app_metadata: dict | None) -> list[str]:
    if role:
        return [role]
    return default_roles(app_metadata)


def user_to_claims(user, profile_role: str | None = None) -> UserClaims:
    return UserClaims(
        user_id=user.id,
        email=user.email,
        roles=roles_from_profile_role(profile_role, user.app_metadata),
    )


def _session_payload(session, claims: UserClaims) -> dict:
    if not session:
        return {
            "access_token": None,
            "refresh_token": None,
            "expires_in": None,
            "token_type": "bearer",
            "user": {
                "user_id": claims.user_id,
                "email": claims.email,
                "roles": claims.roles,
            },
        }

    expires_at_unix = getattr(session, "expires_at", None)
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_in": session.expires_in,
        "expires_at": format_unix_est(expires_at_unix),
        "jwt_expiry_seconds": JWT_EXPIRY_SECONDS,
        "token_type": "bearer",
        "user": {
            "user_id": claims.user_id,
            "email": claims.email,
            "roles": claims.roles,
        },
    }


def verify_jwt(access_token: str) -> UserClaims:
    try:
        response = supabase.auth.get_user(access_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    if not response or not response.user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    return user_to_claims(response.user)


def signup(email: str, password: str) -> dict:
    response = supabase.auth.sign_up({"email": email, "password": password})

    if response.user is None:
        raise HTTPException(status_code=400, detail="Signup failed")

    claims = user_to_claims(response.user)
    session = response.session

    payload = _session_payload(session, claims)
    payload["email_confirmation_required"] = session is None
    return payload


def login(email: str, password: str) -> dict:
    response = supabase.auth.sign_in_with_password(
        {"email": email, "password": password}
    )

    if not response.session or not response.user:
        raise HTTPException(status_code=401, detail="Invalid login credentials")

    claims = user_to_claims(response.user)

    return _session_payload(response.session, claims)


def refresh_session(refresh_token: str) -> dict:
    try:
        response = supabase.auth.refresh_session(refresh_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from exc

    if not response.session or not response.user:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    claims = user_to_claims(response.user)
    return _session_payload(response.session, claims)
