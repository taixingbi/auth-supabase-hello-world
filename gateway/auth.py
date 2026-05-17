import os
from dataclasses import dataclass

from fastapi import HTTPException
from supabase import Client, create_client

from config import JWT_EXPIRY_SECONDS
from time_util import format_unix_est

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
    user_id: str
    email: str | None
    roles: list[str]


def _user_dict(claims: UserClaims) -> dict:
    return {
        "user_id": claims.user_id,
        "email": claims.email,
        "roles": claims.roles,
    }


def user_to_claims(user, profile_role: str | None = None) -> UserClaims:
    if profile_role:
        roles = [profile_role]
    elif user.app_metadata and isinstance(user.app_metadata.get("roles"), list):
        roles = user.app_metadata["roles"]
    else:
        roles = ["user"]
    return UserClaims(user_id=user.id, email=user.email, roles=roles)


def _assert_distinct_tokens(access_token: str | None, refresh_token: str | None) -> None:
    if access_token and refresh_token and access_token == refresh_token:
        raise HTTPException(
            status_code=500,
            detail="Supabase returned identical access_token and refresh_token.",
        )


def _session_payload(session, claims: UserClaims) -> dict:
    if not session:
        return {
            "access_token": None,
            "refresh_token": None,
            "expires_in": None,
            "token_type": "bearer",
            "user": _user_dict(claims),
        }

    _assert_distinct_tokens(session.access_token, session.refresh_token)
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_in": session.expires_in,
        "expires_at": format_unix_est(getattr(session, "expires_at", None)),
        "jwt_expiry_seconds": JWT_EXPIRY_SECONDS,
        "token_type": "bearer",
        "user": _user_dict(claims),
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
    payload = _session_payload(response.session, claims)
    payload["email_confirmation_required"] = response.session is None
    return payload


def login(email: str, password: str) -> dict:
    response = supabase.auth.sign_in_with_password(
        {"email": email, "password": password}
    )
    if not response.session or not response.user:
        raise HTTPException(status_code=401, detail="Invalid login credentials")

    return _session_payload(response.session, user_to_claims(response.user))


def refresh_session(refresh_token: str) -> dict:
    try:
        response = supabase.auth.refresh_session(refresh_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from exc

    if not response.session or not response.user:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    return _session_payload(response.session, user_to_claims(response.user))


def resolve_hello_tokens(
    access_token: str, oauth_refresh: str | None
) -> tuple[str, str, bool, str]:
    """Return (sent_access, active_access, refreshed, oauth_refresh_out)."""
    if not oauth_refresh or not oauth_refresh.strip():
        return access_token, access_token, False, ""

    payload = refresh_session(oauth_refresh.strip())
    return (
        access_token,
        payload["access_token"],
        True,
        payload.get("refresh_token") or "",
    )
