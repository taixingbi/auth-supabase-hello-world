import base64
import json
import uuid
from datetime import datetime, timezone

from auth import UserClaims
from config import JWT_EXPIRY_SECONDS, REFRESH_MARGIN_SECONDS
from time_util import format_unix_est


def jwt_expiry(token: str) -> tuple[int | None, int | None]:
    """Return (exp unix timestamp, seconds until expiry)."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None, None
        payload_b64 = parts[1]
        padding = "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))
        exp = payload.get("exp")
        if not isinstance(exp, int):
            return None, None
        now = int(datetime.now(timezone.utc).timestamp())
        return exp, max(0, exp - now)
    except Exception:
        return None, None


def should_refresh_jwt(
    token: str, margin: int = REFRESH_MARGIN_SECONDS
) -> bool:
    """True when access token is expired or within margin seconds of exp."""
    _exp, expires_in = jwt_expiry(token)
    if expires_in is None:
        return False
    return expires_in <= margin


def new_session_id() -> str:
    return f"sess_{uuid.uuid4().hex[:12]}"


def new_conversation_id() -> str:
    return f"conv_{uuid.uuid4().hex[:12]}"


def new_request_id() -> str:
    return f"req_{uuid.uuid4().hex[:12]}"


def new_trace_id() -> str:
    return f"trace_{uuid.uuid4().hex[:12]}"


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
        "X-User-Roles": ",".join(claims.roles),
        "X-Session-Id": session_id,
        "X-Conversation-Id": conversation_id,
        "X-Request-Id": request_id,
        "X-Trace-Id": trace_id,
    }


def print_context(
    *,
    session_id: str,
    request_id: str,
    trace_id: str,
    conversation_id: str,
    token: str,
    fresh_token: str,
    refreshed: bool,
    expires_at: str,
    expires_in: int | None,
) -> None:
    print("[hello] context:")
    print(f"  session_id:      {session_id}")
    print(f"  request_id:      {request_id}")
    print(f"  trace_id:        {trace_id}")
    print(f"  conversation_id: {conversation_id}")
    print(f"  token:           {token}")
    print(f"  fresh_token:     {fresh_token}")
    print(f"  refreshed:       {refreshed}")
    print(f"  expires_at:      {expires_at}")
    if expires_in is not None:
        print(f"  expires_in:      {expires_in}s")
    else:
        print("  expires_in:      unknown")


def build_hello_response(
    token: str,
    fresh_token: str,
    claims: UserClaims,
    refreshed: bool,
    session_id: str | None,
    conversation_id: str | None,
    request_id: str | None,
    trace_id: str | None,
) -> dict:
    sid = session_id or new_session_id()
    cid = conversation_id or new_conversation_id()
    rid = request_id or new_request_id()
    tid = trace_id or new_trace_id()

    exp_unix, expires_in = jwt_expiry(fresh_token)
    expires_at = format_unix_est(exp_unix)

    print_context(
        session_id=sid,
        request_id=rid,
        trace_id=tid,
        conversation_id=cid,
        token=token,
        fresh_token=fresh_token,
        refreshed=refreshed,
        expires_at=expires_at,
        expires_in=expires_in,
    )

    headers = trusted_headers(fresh_token, claims, sid, cid, rid, tid)
    name = claims.email or claims.user_id

    return {
        "message": f"Hello {name}",
        "user_id": claims.user_id,
        "email": claims.email,
        "roles": claims.roles,
        "session_id": sid,
        "request_id": rid,
        "trace_id": tid,
        "conversation_id": cid,
        "token": token,
        "fresh_token": fresh_token,
        "refreshed": refreshed,
        "expires_at": expires_at,
        "expires_in": expires_in,
        "jwt_expiry_seconds": JWT_EXPIRY_SECONDS,
        "trusted_headers": headers,
    }
