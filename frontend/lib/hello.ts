import {
  getAuthUser,
  getAccessToken,
  getRefreshToken,
  setSession,
  type AuthUser,
  type JwtClaims,
} from "@/lib/session";

export type HelloResponse = {
  message?: string;
  fresh_token?: string;
  refreshed?: boolean;
  refresh_token?: string;
  expires_in?: number;
  jwt_claims?: JwtClaims;
  role?: string;
  team?: string;
  group?: string;
  plan?: string;
  detail?: string;
};

export function applyHelloSession(body: HelloResponse): void {
  if (!body.fresh_token) return;
  const prior = getAuthUser();
  const priorRefresh = getRefreshToken();
  if (!prior) return;

  const claims = body.jwt_claims;
  const user: AuthUser = {
    user_id: prior.user_id,
    email: prior.email,
    role: claims?.role ?? body.role ?? prior.role,
    team: claims?.team ?? body.team ?? prior.team,
    group: claims?.group ?? body.group ?? prior.group,
    plan: claims?.plan ?? body.plan ?? prior.plan,
    jwt_claims: claims,
    roles: [claims?.role ?? prior.role],
  };

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
