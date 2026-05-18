import os

from dotenv import load_dotenv

load_dotenv()

# Access token lifetime (seconds). Match Supabase Dashboard → Auth → JWT expiry.
JWT_EXPIRY_SECONDS = int(os.environ.get("JWT_EXPIRY_SECONDS", str(60 * 60)))

# Password reset email redirect (add to Supabase → Auth → URL configuration)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
