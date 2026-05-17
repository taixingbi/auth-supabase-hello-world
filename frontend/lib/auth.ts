import { setSession, userFromApi, type AuthUser } from "@/lib/session";

export type AuthResponse = {
  access_token?: string | null;
  refresh_token?: string | null;
  expires_in?: number;
  user?: AuthUser;
  jwt_claims?: AuthUser["jwt_claims"];
  detail?: string;
};

export function saveAuthSession(data: AuthResponse): boolean {
  const user = userFromApi(data);
  if (
    !data.access_token ||
    !data.refresh_token ||
    !user ||
    data.access_token === data.refresh_token
  ) {
    return false;
  }
  setSession(data.access_token, user, data.refresh_token, data.expires_in);
  return true;
}
