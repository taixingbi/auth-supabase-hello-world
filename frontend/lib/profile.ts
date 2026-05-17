import { normalizeRoles } from "@/lib/roles";
import {
  getAccessToken,
  getAuthUser,
  getRefreshToken,
  setSession,
  type AuthUser,
  type JwtClaims,
} from "@/lib/session";

export type ProfileResponse = {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  roles: string[];
  team: string;
  group: string;
  plan: string;
  jwt_claims?: JwtClaims;
  created_at?: string;
  updated_at?: string;
  detail?: string;
};

export function profileToAuthUser(
  data: ProfileResponse,
  prior: AuthUser,
): AuthUser {
  const claims = data.jwt_claims;
  const roles = normalizeRoles(data.roles ?? claims?.roles);
  return {
    user_id: prior.user_id,
    email: data.email ?? prior.email,
    roles,
    team: data.team ?? claims?.team ?? prior.team,
    group: data.group ?? claims?.group ?? prior.group,
    plan: data.plan ?? claims?.plan ?? prior.plan,
    jwt_claims: claims ?? {
      sub: prior.user_id,
      email: data.email ?? prior.email ?? "",
      roles,
      team: data.team,
      group: data.group,
      plan: data.plan,
    },
  };
}

export function applyProfileSession(data: ProfileResponse): AuthUser | null {
  const token = getAccessToken();
  const prior = getAuthUser();
  if (!token || !prior) return null;

  const user = profileToAuthUser(data, prior);
  setSession(token, user, getRefreshToken());
  return user;
}
