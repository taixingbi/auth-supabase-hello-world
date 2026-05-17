from fastapi import HTTPException
from postgrest.exceptions import APIError
from pydantic import BaseModel, EmailStr, Field

from claims import UserClaims
from supabase_client import supabase, supabase_admin
from time_util import format_iso_est
from user_meta import sync_jwt_metadata

DEFAULT_TEAM = "ai-platform"
DEFAULT_GROUP = "engineering"
DEFAULT_PLAN = "free"

class ProfileUpdate(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=1, max_length=64)
    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    role: str | None = Field(default=None, min_length=1, max_length=32)
    team: str | None = Field(default=None, min_length=1, max_length=64)
    group: str | None = Field(default=None, min_length=1, max_length=64)
    plan: str | None = Field(default=None, min_length=1, max_length=32)


def _claims_from_row(row: dict) -> UserClaims:
    return UserClaims(
        user_id=row["id"],
        email=row.get("email"),
        role=row.get("role") or "user",
        team=row.get("team") or DEFAULT_TEAM,
        group=row.get("user_group") or DEFAULT_GROUP,
        plan=row.get("plan") or DEFAULT_PLAN,
    )


def _row_to_dict(row: dict, plan: str | None = None) -> dict:
    claims = _claims_from_row(row)
    if plan is not None:
        claims = UserClaims(
            user_id=claims.user_id,
            email=claims.email,
            role=claims.role,
            team=claims.team,
            group=claims.group,
            plan=plan,
        )
    return {
        "id": row["id"],
        "email": row.get("email"),
        "username": row.get("username"),
        "display_name": row.get("display_name"),
        "role": claims.role,
        "team": claims.team,
        "group": claims.group,
        "plan": claims.plan,
        "jwt_claims": claims.to_jwt_claims(),
        "created_at": format_iso_est(row.get("created_at")),
    }


def _handle_db_error(exc: Exception) -> None:
    if isinstance(exc, APIError):
        message = exc.message or str(exc)
        if "schema cache" in message.lower() or "could not find" in message.lower():
            raise HTTPException(
                status_code=400,
                detail=(
                    f"profiles column mismatch: {message}. "
                    "Expected columns: id, email, username, display_name, role, "
                    "created_at, team, user_group. Plan is stored in auth user_metadata."
                ),
            ) from exc
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
    if supabase_admin:
        return supabase_admin.table("profiles")
    supabase.postgrest.auth(access_token)
    return supabase.table("profiles")


def fetch_profile_row(access_token: str, user_id: str) -> dict | None:
    try:
        result = (
            _profiles_table(access_token)
            .select("id,email,username,display_name,role,created_at,team,user_group")
            .eq("id", user_id)
            .execute()
        )
    except Exception as exc:
        _handle_db_error(exc)
    if not result.data:
        return None
    return result.data[0]


def ensure_profile(access_token: str, claims: UserClaims) -> dict:
    row = fetch_profile_row(access_token, claims.user_id)
    if row:
        return _row_to_dict(row, plan=claims.plan)

    insert = {
        "id": claims.user_id,
        "email": claims.email,
        "role": claims.role,
        "team": claims.team,
        "user_group": claims.group,
    }
    try:
        created = _profiles_table(access_token).insert(insert).execute()
    except Exception as exc:
        _handle_db_error(exc)

    if not created.data:
        row = fetch_profile_row(access_token, claims.user_id)
        if row:
            return _row_to_dict(row, plan=claims.plan)
        raise HTTPException(status_code=500, detail="Failed to create profile")

    sync_jwt_metadata(
        claims.user_id,
        access_token,
        team=claims.team,
        group=claims.group,
        plan=claims.plan,
    )
    return _row_to_dict(created.data[0], plan=claims.plan)


def get_profile(access_token: str, claims: UserClaims) -> dict:
    row = fetch_profile_row(access_token, claims.user_id)
    if row:
        return _row_to_dict(row, plan=claims.plan)
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
    if body.role is not None:
        updates["role"] = body.role.strip()
    if body.team is not None:
        updates["team"] = body.team.strip()
    if body.group is not None:
        updates["user_group"] = body.group.strip()

    meta_team = body.team.strip() if body.team is not None else None
    meta_group = body.group.strip() if body.group is not None else None
    meta_plan = body.plan.strip() if body.plan is not None else None

    if not updates and meta_team is None and meta_group is None and meta_plan is None:
        return get_profile(access_token, claims)

    if updates:
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

    if meta_team is not None or meta_group is not None or meta_plan is not None:
        sync_jwt_metadata(
            claims.user_id,
            access_token,
            team=meta_team,
            group=meta_group,
            plan=meta_plan,
        )

    row = fetch_profile_row(access_token, claims.user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")

    plan_value = meta_plan if meta_plan is not None else claims.plan
    return _row_to_dict(row, plan=plan_value)
