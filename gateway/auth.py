from fastapi import HTTPException

from claims import UserClaims
from config import JWT_EXPIRY_SECONDS
from profile import fetch_profile_row
from supabase_client import supabase
from time_util import format_unix_est
from user_meta import meta_get

DEFAULT_TEAM = "ai-platform"
DEFAULT_GROUP = "engineering"
DEFAULT_PLAN = "free"


def user_to_claims(user, profile_row: dict | None = None) -> UserClaims:
    row = profile_row or {}
    return UserClaims(
        user_id=user.id,
        email=row.get("email") or user.email,
        role=row.get("role") or meta_get(user, "role", "user"),
        team=row.get("team") or meta_get(user, "team", DEFAULT_TEAM),
        group=row.get("user_group") or meta_get(user, "group", DEFAULT_GROUP),
        plan=row.get("plan") or meta_get(user, "plan", DEFAULT_PLAN),
    )


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
            "user": claims.to_user_dict(),
        }

    _assert_distinct_tokens(session.access_token, session.refresh_token)
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_in": session.expires_in,
        "expires_at": format_unix_est(getattr(session, "expires_at", None)),
        "jwt_expiry_seconds": JWT_EXPIRY_SECONDS,
        "jwt_claims": claims.to_jwt_claims(),
        "token_type": "bearer",
        "user": claims.to_user_dict(),
    }


def verify_jwt(access_token: str) -> UserClaims:
    try:
        response = supabase.auth.get_user(access_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    if not response or not response.user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    row = fetch_profile_row(access_token, response.user.id)
    return user_to_claims(response.user, row)


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

    row = fetch_profile_row(response.session.access_token, response.user.id)
    return _session_payload(response.session, user_to_claims(response.user, row))


def refresh_session(refresh_token: str) -> dict:
    try:
        response = supabase.auth.refresh_session(refresh_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from exc

    if not response.session or not response.user:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    row = fetch_profile_row(response.session.access_token, response.user.id)
    return _session_payload(response.session, user_to_claims(response.user, row))


def resolve_hello_tokens(
    access_token: str, oauth_refresh: str | None
) -> tuple[str, str, bool, str]:
    if not oauth_refresh or not oauth_refresh.strip():
        return access_token, access_token, False, ""

    payload = refresh_session(oauth_refresh.strip())
    return (
        access_token,
        payload["access_token"],
        True,
        payload.get("refresh_token") or "",
    )
