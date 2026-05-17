"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Feedback } from "@/components/feedback";
import {
  applyHelloSession,
  helloAuthHeaders,
  type HelloResponse,
} from "@/lib/hello";
import {
  clearSession,
  getAccessToken,
  getAuthUser,
  type AuthUser,
} from "@/lib/session";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const u = getAuthUser();
    if (!getAccessToken() || !u) {
      router.replace("/login");
      return;
    }
    setUser(u);
  }, [router]);

  async function callHello() {
    setLoading(true);
    setFeedback(null);
    setResult(null);

    const headers = helloAuthHeaders();
    if (!headers) {
      router.replace("/login");
      return;
    }

    try {
      const res = await fetch("/api/hello", { headers });
      const body: HelloResponse = await res.json();

      if (!res.ok) {
        setFeedback({
          type: "error",
          message:
            typeof body.detail === "string" ? body.detail : "Request failed",
        });
        return;
      }

      applyHelloSession(body);
      setResult(JSON.stringify(body, null, 2));
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to fetch — is the gateway running on port 8000?",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleSignOut() {
    clearSession();
    router.push("/login");
  }

  if (!user) {
    return (
      <main>
        <p className="sub">Loading session…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "36rem" }}>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h1>Dashboard</h1>
        <p className="sub">
          <strong>{user.email}</strong>
          <br />
          user_id: {user.user_id}
          <br />
          roles: {user.roles.join(", ")}
        </p>
        <button type="button" className="btn secondary" onClick={handleSignOut}>
          Sign out
        </button>
      </div>

      {feedback && (
        <Feedback type={feedback.type} message={feedback.message} />
      )}

      <div className="card">
        <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>GET /hello</h2>
        <p className="sub">
          Refreshes via X-Refresh-Token. refresh_token is a short opaque
          string from Supabase (not a JWT); fresh_token is the new access JWT.
        </p>
        <button
          type="button"
          className="btn"
          onClick={callHello}
          disabled={loading}
        >
          {loading ? "Loading…" : "GET /api/hello"}
        </button>
        {result && (
          <pre
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              background: "#0f1419",
              borderRadius: 8,
              overflow: "auto",
              fontSize: "0.8rem",
              whiteSpace: "pre-wrap",
            }}
          >
            {result}
          </pre>
        )}
      </div>

      <p className="sub" style={{ textAlign: "center", marginTop: "1.5rem" }}>
        <Link href="/">← Home</Link>
      </p>
    </main>
  );
}
