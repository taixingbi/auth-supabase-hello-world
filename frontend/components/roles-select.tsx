"use client";

import { ROLE_OPTIONS } from "@/lib/roles";

type RolesSelectProps = {
  id?: string;
  value: string[];
  onChange: (roles: string[]) => void;
  disabled?: boolean;
};

export function RolesSelect({
  id = "roles",
  value,
  onChange,
  disabled = false,
}: RolesSelectProps) {
  const selected = new Set(value.map((r) => r.toLowerCase()));

  function toggle(role: (typeof ROLE_OPTIONS)[number], checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(role);
    else next.delete(role);

    const roles = ROLE_OPTIONS.filter((r) => next.has(r));
    onChange(roles.length ? roles : ["user"]);
  }

  return (
    <fieldset className="roles-checkboxes" id={id} disabled={disabled}>
      <legend className="sr-only">Roles</legend>
      {ROLE_OPTIONS.map((role) => {
        const inputId = `${id}-${role}`;
        const checked = selected.has(role);
        return (
          <label key={role} className="roles-checkbox" htmlFor={inputId}>
            <input
              id={inputId}
              type="checkbox"
              name={id}
              value={role}
              checked={checked}
              disabled={disabled}
              onChange={(e) => toggle(role, e.target.checked)}
            />
            <span>{role}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
