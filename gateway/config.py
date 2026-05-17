import os

# Access token lifetime (seconds). Must match Supabase Dashboard → Auth → JWT expiry.
JWT_EXPIRY_SECONDS = int(os.environ.get("JWT_EXPIRY_SECONDS", str(30 * 60)))

# Refresh access token when this many seconds remain before JWT exp.
REFRESH_MARGIN_SECONDS = int(os.environ.get("REFRESH_MARGIN_SECONDS", "60"))
