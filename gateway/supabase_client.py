import os

from supabase import Client, create_client


def _env(*keys: str) -> str:
    for key in keys:
        value = os.environ.get(key, "").strip()
        if value:
            return value
    return ""


SUPABASE_URL = _env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
SUPABASE_ANON_KEY = _env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = _env(
    "SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"
)

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    raise RuntimeError(
        "Set SUPABASE_URL and SUPABASE_ANON_KEY in gateway/.env "
        "(legacy: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

supabase_admin: Client | None = None
if SUPABASE_SERVICE_ROLE_KEY:
    supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
