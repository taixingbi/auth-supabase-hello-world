"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Feedback } from "@/components/feedback";
import { authFetch, getAccessToken } from "@/lib/session";

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  role: string;
  team: string;
  group: string;
  plan: string;
  jwt_claims?: {
    sub: string;
    email: string;
    role: string;
    team: string;
    group: string;
    plan: string;
  };
  created_at?: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("user");
  const [team, setTeam] = useState("ai-platform");
  const [group, setGroup] = useState("engineering");
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    loadProfile();
  }, [router]);

  async function loadProfile() {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await authFetch("/api/profile");
      const data: Profile & { detail?: string } = await res.json();
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data.detail ?? "Failed to load profile",
        });
        return;
      }
      setEmail(data.email ?? "");
      setUsername(data.username ?? "");
      setDisplayName(data.display_name ?? "");
      setRole(data.role ?? "user");
      setTeam(data.team ?? "ai-platform");
      setGroup(data.group ?? "engineering");
      setPlan(data.plan ?? "free");
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to fetch — is the gateway running?",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await authFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || undefined,
          username: username.trim() || undefined,
          display_name: displayName.trim() || undefined,
          role: role.trim() || undefined,
          team: team.trim() || undefined,
          group: group.trim() || undefined,
          plan: plan.trim() || undefined,
        }),
      });
      const data: Profile & { detail?: string } = await res.json();
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data.detail ?? "Update failed",
        });
        return;
      }
      setEmail(data.email ?? "");
      setUsername(data.username ?? "");
      setDisplayName(data.display_name ?? "");
      setRole(data.role ?? "user");
      setTeam(data.team ?? team);
      setGroup(data.group ?? group);
      setPlan(data.plan ?? plan);
      setFeedback({ type: "success", message: "Profile saved." });
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to fetch — is the gateway running?",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main>
        <p className="sub">Loading profile…</p>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h1>Profile</h1>
        <p className="sub">Update your Supabase profiles row</p>

        <form onSubmit={handleSubmit}>
          <label className="sub" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <label className="sub" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="field"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="unique username"
            autoComplete="username"
          />

          <label className="sub" htmlFor="display_name">
            Display name
          </label>
          <input
            id="display_name"
            className="field"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />

          <label className="sub" htmlFor="role">
            Role
          </label>
          <input
            id="role"
            className="field"
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="user, admin, …"
          />

          <label className="sub" htmlFor="team">
            Team
          </label>
          <input
            id="team"
            className="field"
            type="text"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            placeholder="ai-platform"
          />

          <label className="sub" htmlFor="group">
            Group
          </label>
          <input
            id="group"
            className="field"
            type="text"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="engineering"
          />

          <label className="sub" htmlFor="plan">
            Plan
          </label>
          <input
            id="plan"
            className="field"
            type="text"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            placeholder="free, pro, …"
          />

          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </button>
        </form>

        {feedback && (
          <Feedback type={feedback.type} message={feedback.message} />
        )}

        <p className="sub" style={{ marginTop: "1.25rem", marginBottom: 0 }}>
          <Link href="/dashboard">← Dashboard</Link>
        </p>
      </div>
    </main>
  );
}
