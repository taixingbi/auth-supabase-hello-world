from fastapi import HTTPException
from postgrest.exceptions import APIError
from pydantic import BaseModel, EmailStr, Field

from auth import UserClaims, supabase, supabase_admin
from time_util import format_iso_est


class ProfileUpdate(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=1, max_length=64)
    display_name: str | None = Field(default=None, min_length=1, max_length=128)


def _row_to_dict(row: dict) -> dict:
    return {
        "id": row["id"],
        "email": row.get("email"),
        "username": row.get("username"),
        "display_name": row.get("display_name"),
        "role": row.get("role") or "user",
        "created_at": format_iso_est(row.get("created_at")),
    }


def _handle_db_error(exc: Exception) -> None:
    if isinstance(exc, APIError):
        message = exc.message or str(exc)
        if exc.code == "42501" or "row-level security" in message.lower():
            raise HTTPException(
                status_code=403,
                detail=(
                    "Profile blocked by Supabase RLS. Add SUPABASE_SERVICE_ROLE_KEY "
                    "to gateway/.env (server-only), or run sql/profiles_rls.sql in Supabase."
                ),
            ) from exc
        if "duplicate" in message.lower() or "unique" in message.lower():
            raise HTTPException(status_code=409, detail="Username already taken") from exc
        raise HTTPException(status_code=400, detail=message) from exc
    raise HTTPException(status_code=500, detail=str(exc)) from exc


def _profiles_table(access_token: str):
    """Use service-role client after JWT is verified; else user JWT + RLS."""
    if supabase_admin:
        return supabase_admin.table("profiles")
    supabase.postgrest.auth(access_token)
    return supabase.table("profiles")


def _get_row(access_token: str, user_id: str) -> dict | None:
    try:
        result = _profiles_table(access_token).select("*").eq("id", user_id).execute()
    except Exception as exc:
        _handle_db_error(exc)
    if not result.data:
        return None
    return result.data[0]


def ensure_profile(access_token: str, claims: UserClaims) -> dict:
    row = _get_row(access_token, claims.user_id)
    if row:
        return _row_to_dict(row)

    insert = {
        "id": claims.user_id,
        "email": claims.email,
        "role": "user",
    }
    try:
        created = _profiles_table(access_token).insert(insert).execute()
    except Exception as exc:
        _handle_db_error(exc)

    if not created.data:
        row = _get_row(access_token, claims.user_id)
        if row:
            return _row_to_dict(row)
        raise HTTPException(status_code=500, detail="Failed to create profile")

    return _row_to_dict(created.data[0])


def get_profile(access_token: str, claims: UserClaims) -> dict:
    row = _get_row(access_token, claims.user_id)
    if row:
        return _row_to_dict(row)
    return ensure_profile(access_token, claims)


def update_profile(
    access_token: str,
    claims: UserClaims,
    body: ProfileUpdate,
) -> dict:
    ensure_profile(access_token, claims)

    updates: dict = {}
    if body.email is not None:
        updates["email"] = body.email
    if body.username is not None:
        updates["username"] = body.username.strip()
    if body.display_name is not None:
        updates["display_name"] = body.display_name.strip()

    if not updates:
        return get_profile(access_token, claims)

    try:
        result = (
            _profiles_table(access_token)
            .update(updates)
            .eq("id", claims.user_id)
            .execute()
        )
    except Exception as exc:
        _handle_db_error(exc)

    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    return _row_to_dict(result.data[0])
