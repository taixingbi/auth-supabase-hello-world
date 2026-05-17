"""JWT fields on auth.users user_metadata (plan is not on profiles)."""

import base64
import json

import httpx
from fastapi import HTTPException
from supabase_auth.errors import AuthApiError

from supabase_client import (
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
    supabase,
    supabase_admin,
)

DEFAULT_TEAM = "ai-platform"
DEFAULT_GROUP = "engineering"
DEFAULT_PLAN = "free"


def meta_get(user, key: str, default: str) -> str:
    for source in (user.user_metadata or {}, user.app_metadata or {}):
        value = source.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return default


def _jwt_role(key: str | None) -> str | None:
    if not key or not key.startswith("eyJ"):
        return None
    try:
        parts = key.split(".")
        if len(parts) < 2:
            return None
        payload_b64 = parts[1]
        padding = "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))
        role = payload.get("role")
        return role if isinstance(role, str) else None
    except Exception:
        return None


def _service_role_client():
    """Only use admin API when the key is actually service_role."""
    if not supabase_admin or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    if _jwt_role(SUPABASE_SERVICE_ROLE_KEY) != "service_role":
        return None
    return supabase_admin


def _update_user_metadata(access_token: str, data: dict[str, str]) -> None:
    """PUT /auth/v1/user with the caller's access token (GoTrue user update)."""
    url = f"{SUPABASE_URL}/auth/v1/user"
    try:
        res = httpx.put(
            url,
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"data": data},
            timeout=30.0,
        )
        res.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text or str(exc)
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def sync_jwt_metadata(
    user_id: str,
    access_token: str,
    *,
    team: str | None = None,
    group: str | None = None,
    plan: str | None = None,
) -> None:
    payload: dict[str, str] = {}
    if team is not None:
        payload["team"] = team
    if group is not None:
        payload["group"] = group
    if plan is not None:
        payload["plan"] = plan
    if not payload:
        return

    admin = _service_role_client()
    if admin:
        try:
            admin.auth.admin.update_user_by_id(user_id, {"user_metadata": payload})
            return
        except AuthApiError as exc:
            if "not allowed" not in str(exc).lower():
                raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        current = supabase.auth.get_user(access_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    if not current or not current.user or current.user.id != user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    merged = dict(current.user.user_metadata or {})
    merged.update(payload)

    try:
        _update_user_metadata(access_token, merged)
    except HTTPException as exc:
        if exc.status_code == 403:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{exc.detail}. "
                    "Set SUPABASE_SERVICE_ROLE_KEY to the real service_role secret "
                    "(Project Settings → API), not the anon/publishable key."
                ),
            ) from exc
        raise
