import base64
import json
from datetime import datetime, timezone


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
