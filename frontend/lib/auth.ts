import { setSession, type AuthUser } from "@/lib/session";

export type AuthResponse = {
  access_token?: string | null;
  refresh_token?: string | null;
  expires_in?: number;
  user?: AuthUser;
  detail?: string;
};

/** Persist session from login/signup. Returns false if tokens are missing or invalid. */
export function saveAuthSession(data: AuthResponse): boolean {
  if (
    !data.access_token ||
    !data.refresh_token ||
    !data.user ||
    data.access_token === data.refresh_token
  ) {
    return false;
  }
  setSession(data.access_token, data.user, data.refresh_token, data.expires_in);
  return true;
}
