/** Parse Supabase recovery tokens from the email redirect URL hash. */
export function parseRecoveryHash(): {
  access_token: string;
  refresh_token: string | null;
  type: string | null;
} | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  if (!access_token) return null;

  return {
    access_token,
    refresh_token: params.get("refresh_token"),
    type: params.get("type"),
  };
}
