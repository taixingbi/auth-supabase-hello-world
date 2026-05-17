import { getAuthUser, getAccessToken, getRefreshToken, setSession } from "@/lib/session";

export type HelloResponse = {
  message?: string;
  fresh_token?: string;
  refreshed?: boolean;
  refresh_token?: string;
  expires_in?: number;
  detail?: string;
};

/** Apply tokens from GET /hello when Supabase rotated the session. */
export function applyHelloSession(body: HelloResponse): void {
  if (!body.fresh_token) return;
  const user = getAuthUser();
  const priorRefresh = getRefreshToken();
  if (!user) return;

  setSession(
    body.fresh_token,
    user,
    body.refreshed && body.refresh_token ? body.refresh_token : priorRefresh,
    body.expires_in,
  );
}

export function helloAuthHeaders(): Record<string, string> | null {
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();
  if (!accessToken || !refreshToken) return null;
  return {
    Authorization: `Bearer ${accessToken}`,
    "X-Refresh-Token": refreshToken,
  };
}
