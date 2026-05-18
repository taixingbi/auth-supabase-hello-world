import httpx
from fastapi import HTTPException
from supabase_auth.errors import AuthApiError

from claims import UserClaims
from config import FRONTEND_URL, JWT_EXPIRY_SECONDS
from profile import fetch_profile_row, resolve_login_email
from roles import normalize_roles
from supabase_client import SUPABASE_ANON_KEY, SUPABASE_URL, supabase
from time_util import format_unix_est
from user_meta import meta_get

DEFAULT_TEAM = "ai-platform"
DEFAULT_GROUP = "engineering"
DEFAULT_PLAN = "free"


def _roles_from_user(user, row: dict) -> list[str]:
    if row.get("roles") is not None:
        return normalize_roles(row.get("roles"))
    for source in (user.user_metadata or {}, user.app_metadata or {}):
        if source.get("roles") is not None:
            return normalize_roles(source.get("roles"))
        legacy = source.get("role")
        if isinstance(legacy, str) and legacy.strip():
            return [legacy.strip()]
    return ["user"]


def user_to_claims(user, profile_row: dict | None = None) -> UserClaims:
    row = profile_row or {}
    return UserClaims(
        user_id=user.id,
        email=row.get("email") or user.email,
        roles=_roles_from_user(user, row),
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


def login(identifier: str, password: str) -> dict:
    email = resolve_login_email(identifier)
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


def _auth_error(exc: Exception, default: str = "Request failed") -> HTTPException:
    if isinstance(exc, AuthApiError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, HTTPException):
        return exc
    return HTTPException(status_code=400, detail=str(exc) or default)


def _update_password_with_token(access_token: str, new_password: str) -> None:
    url = f"{SUPABASE_URL}/auth/v1/user"
    try:
        res = httpx.put(
            url,
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"password": new_password},
            timeout=30.0,
        )
        res.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text or "Could not update password"
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def forgot_password(email: str) -> dict:
    redirect_to = f"{FRONTEND_URL}/auth/reset-password"
    try:
        supabase.auth.reset_password_for_email(
            email.strip(),
            {"redirect_to": redirect_to},
        )
    except Exception as exc:
        raise _auth_error(exc, "Could not send reset email") from exc

    return {
        "message": "If an account exists for that email, a password reset link was sent.",
        "redirect_to": redirect_to,
    }


def reset_password(
    access_token: str,
    new_password: str,
    refresh_token: str | None = None,
) -> dict:
    """Set a new password using tokens from the Supabase recovery email link."""
    try:
        user_resp = supabase.auth.get_user(access_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired reset link") from exc

    if not user_resp or not user_resp.user:
        raise HTTPException(status_code=401, detail="Invalid or expired reset link")

    _update_password_with_token(access_token, new_password)

    if refresh_token:
        try:
            session_resp = supabase.auth.set_session(access_token, refresh_token)
        except TypeError:
            session_resp = supabase.auth.set_session(
                {"access_token": access_token, "refresh_token": refresh_token}
            )
        except Exception as exc:
            raise _auth_error(exc, "Password updated but session failed") from exc

        if session_resp.session and session_resp.user:
            row = fetch_profile_row(
                session_resp.session.access_token, session_resp.user.id
            )
            payload = _session_payload(
                session_resp.session, user_to_claims(session_resp.user, row)
            )
            payload["message"] = "Password updated successfully."
            return payload

    return {"message": "Password updated successfully. You can log in now."}


def change_password(
    access_token: str,
    new_password: str,
    refresh_token: str | None = None,
) -> dict:
    """Update password for the currently signed-in user."""
    claims = verify_jwt(access_token)
    _update_password_with_token(access_token, new_password)

    if refresh_token:
        try:
            refreshed = supabase.auth.refresh_session(refresh_token)
        except Exception as exc:
            raise _auth_error(exc, "Password updated but could not refresh session") from exc

        if refreshed.session and refreshed.user:
            row = fetch_profile_row(
                refreshed.session.access_token, refreshed.user.id
            )
            payload = _session_payload(
                refreshed.session, user_to_claims(refreshed.user, row)
            )
            payload["message"] = "Password updated successfully."
            return payload

    row = fetch_profile_row(access_token, claims.user_id)
    user_resp = supabase.auth.get_user(access_token)
    if user_resp and user_resp.user:
        return {
            "message": "Password updated successfully.",
            "user": user_to_claims(user_resp.user, row).to_user_dict(),
        }

    return {"message": "Password updated successfully."}


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
