import uuid

from claims import UserClaims
from config import JWT_EXPIRY_SECONDS
from jwt_util import jwt_expiry
from time_util import format_unix_est


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def trusted_headers(
    jwt: str,
    claims: UserClaims,
    session_id: str,
    conversation_id: str,
    request_id: str,
    trace_id: str,
) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {jwt}",
        "X-User-Id": claims.user_id,
        "X-User-Email": claims.email or "",
        "X-User-Role": claims.role,
        "X-User-Team": claims.team,
        "X-User-Group": claims.group,
        "X-User-Plan": claims.plan,
        "X-Session-Id": session_id,
        "X-Conversation-Id": conversation_id,
        "X-Request-Id": request_id,
        "X-Trace-Id": trace_id,
    }


def _print_hello_context(
    *,
    session_id: str,
    request_id: str,
    trace_id: str,
    conversation_id: str,
    access_sent: str,
    access_active: str,
    refreshed: bool,
    oauth_refresh: str,
    jwt_claims: dict[str, str],
    expires_at: str,
    expires_in: int | None,
) -> None:
    print("[hello] context:")
    print(f"  session_id:            {session_id}")
    print(f"  request_id:            {request_id}")
    print(f"  trace_id:              {trace_id}")
    print(f"  conversation_id:       {conversation_id}")
    print(f"  access_token (sent):   {access_sent}")
    print(f"  access_token (active): {access_active}")
    print(f"  refreshed:             {refreshed}")
    print(f"  oauth_refresh_token:   {oauth_refresh or '(empty)'}")
    print(f"  jwt_claims:            {jwt_claims}")
    print(f"  expires_at:            {expires_at}")
    print(f"  expires_in:            {expires_in if expires_in is not None else 'unknown'}s")


def build_hello_response(
    access_sent: str,
    access_active: str,
    claims: UserClaims,
    refreshed: bool,
    oauth_refresh: str,
    session_id: str | None,
    conversation_id: str | None,
    request_id: str | None,
    trace_id: str | None,
) -> dict:
    sid = session_id or _new_id("sess")
    cid = conversation_id or _new_id("conv")
    rid = request_id or _new_id("req")
    tid = trace_id or _new_id("trace")

    _exp, expires_in = jwt_expiry(access_active)
    expires_at = format_unix_est(_exp)
    jwt_claims = claims.to_jwt_claims()

    _print_hello_context(
        session_id=sid,
        request_id=rid,
        trace_id=tid,
        conversation_id=cid,
        access_sent=access_sent,
        access_active=access_active,
        refreshed=refreshed,
        oauth_refresh=oauth_refresh,
        jwt_claims=jwt_claims,
        expires_at=expires_at,
        expires_in=expires_in,
    )

    name = claims.email or claims.user_id
    return {
        "message": f"Hello {name}",
        "user_id": claims.user_id,
        "email": claims.email,
        "role": claims.role,
        "team": claims.team,
        "group": claims.group,
        "plan": claims.plan,
        "jwt_claims": jwt_claims,
        "roles": [claims.role],
        "session_id": sid,
        "request_id": rid,
        "trace_id": tid,
        "conversation_id": cid,
        "token": access_sent,
        "token_kind": "access_jwt",
        "fresh_token": access_active,
        "fresh_token_kind": "access_jwt",
        "refreshed": refreshed,
        "refresh_token": oauth_refresh,
        "refresh_token_kind": "oauth_refresh_opaque",
        "refresh_token_length": len(oauth_refresh) if oauth_refresh else 0,
        "expires_at": expires_at,
        "expires_in": expires_in,
        "jwt_expiry_seconds": JWT_EXPIRY_SECONDS,
        "trusted_headers": trusted_headers(
            access_active, claims, sid, cid, rid, tid
        ),
    }
