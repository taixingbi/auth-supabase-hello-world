const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_KEY = "auth_user";
const EXPIRES_AT_KEY = "token_expires_at";

export const JWT_EXPIRY_SECONDS =
  Number(process.env.JWT_EXPIRY_SECONDS) ||
  Number(process.env.NEXT_PUBLIC_JWT_EXPIRY_SECONDS) ||
  60 * 60;

const REFRESH_MARGIN_SECONDS = 60;

export type JwtClaims = {
  sub: string;
  email: string;
  roles: string[];
  team: string;
  group: string;
  plan: string;
};

export type AuthUser = {
  user_id: string;
  email: string | null;
  roles: string[];
  team: string;
  group: string;
  plan: string;
  jwt_claims?: JwtClaims;
};

function normalizeRoles(value: unknown): string[] {
  if (Array.isArray(value)) {
    const parts = value.map((r) => String(r).trim()).filter(Boolean);
    return parts.length ? parts : ["user"];
  }
  if (typeof value === "string" && value.trim()) {
    const parts = value
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    return parts.length ? parts : ["user"];
  }
  return ["user"];
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function getExpiresAtUnix(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(EXPIRES_AT_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function isAccessTokenExpired(): boolean {
  const exp = getExpiresAtUnix();
  if (exp === null) return false;
  return Math.floor(Date.now() / 1000) >= exp - REFRESH_MARGIN_SECONDS;
}

function userFromApi(data: {
  user?: AuthUser & { role?: string };
  jwt_claims?: JwtClaims & { role?: string };
}): AuthUser | null {
  if (!data.user) return null;
  const u = data.user;
  const claims = data.jwt_claims ?? u.jwt_claims;
  const roles =
    claims?.roles ??
    u.roles ??
    (claims?.role ? [claims.role] : undefined) ??
    (u.role ? [u.role] : ["user"]);

  return {
    user_id: u.user_id,
    email: u.email,
    roles: normalizeRoles(roles),
    team: claims?.team ?? u.team ?? "ai-platform",
    group: claims?.group ?? u.group ?? "engineering",
    plan: claims?.plan ?? u.plan ?? "free",
    jwt_claims: claims
      ? {
          sub: claims.sub,
          email: claims.email,
          roles: normalizeRoles(claims.roles ?? roles),
          team: claims.team,
          group: claims.group,
          plan: claims.plan,
        }
      : undefined,
  };
}

export function setSession(
  accessToken: string,
  user: AuthUser,
  refreshToken?: string | null,
  expiresIn?: number | null,
) {
  if (refreshToken && refreshToken === accessToken) {
    throw new Error(
      "refresh_token must not equal access_token — clear site data and log in again",
    );
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
  const ttl = expiresIn && expiresIn > 0 ? expiresIn : JWT_EXPIRY_SECONDS;
  localStorage.setItem(
    EXPIRES_AT_KEY,
    String(Math.floor(Date.now() / 1000) + ttl),
  );
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthUser & { role?: string };
    return {
      ...parsed,
      roles: normalizeRoles(parsed.roles ?? parsed.role),
    };
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await res.json();

  if (!res.ok || !data.access_token) {
    clearSession();
    return null;
  }

  const user = userFromApi(data);
  if (!user) {
    clearSession();
    return null;
  }

  setSession(
    data.access_token,
    user,
    data.refresh_token ?? refreshToken,
    data.expires_in,
  );
  return data.access_token;
}

async function ensureFreshAccessToken(): Promise<string | null> {
  let accessToken = getAccessToken();
  if (!accessToken) return null;
  if (isAccessTokenExpired()) {
    accessToken = await refreshAccessToken();
  }
  return accessToken;
}

export async function authFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  let accessToken = await ensureFreshAccessToken();
  if (!accessToken) throw new Error("Not authenticated");

  const withAuth = (token: string): RequestInit => ({
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });

  let res = await fetch(input, withAuth(accessToken));
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await fetch(input, withAuth(newToken));
  }
  return res;
}

export { userFromApi };
