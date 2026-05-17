export const ROLE_OPTIONS = ["user", "admin"] as const;

export type RoleOption = (typeof ROLE_OPTIONS)[number];

export function normalizeRoles(value: unknown): string[] {
  let raw: string[] = [];
  if (Array.isArray(value)) {
    raw = value.map((r) => String(r).trim()).filter(Boolean);
  } else if (typeof value === "string" && value.trim()) {
    raw = value
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  }

  const picked = ROLE_OPTIONS.filter((role) =>
    raw.some((r) => r.toLowerCase() === role),
  );
  return picked.length ? [...picked] : ["user"];
}
