"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Feedback } from "@/components/feedback";
import {
  clearSession,
  getAccessToken,
  getAuthUser,
  getRefreshToken,
  isAccessTokenExpired,
  setSession,
  type AuthUser,
} from "@/lib/session";

type HelloResponse = {
  message?: string;
  user_id?: string;
  email?: string;
  roles?: string[];
  session_id?: string;
  request_id?: string;
  trace_id?: string;
  conversation_id?: string;
  token?: string;
  fresh_token?: string;
  refreshed?: boolean;
  refresh_token?: string;
  expires_at?: string;
  expires_in?: number;
  jwt_expiry_seconds?: number;
  trusted_headers?: Record<string, string>;
  detail?: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = getAccessToken();
    const r = getRefreshToken();
    const u = getAuthUser();
    if (!t || !r || !u) {
      router.replace("/login");
      return;
    }
    setToken(t);
    setUser(u);
  }, [router]);

  async function callHello() {
    if (!token) return;
    setLoading(true);
    setFeedback(null);
    setResult(null);

    try {
      const accessToken = getAccessToken();
      const refreshToken = getRefreshToken();
      if (!accessToken || !refreshToken) return;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
      };
      if (isAccessTokenExpired()) {
        headers["X-Refresh-Token"] = refreshToken;
      }

      const res = await fetch("/api/hello", { headers });

      const body: HelloResponse = await res.json();
      if (res.ok && body.refreshed && body.fresh_token) {
        const user = getAuthUser();
        if (user) {
          setSession(
            body.fresh_token,
            user,
            body.refresh_token ?? refreshToken,
            body.expires_in,
          );
          setToken(body.fresh_token);
        }
      }
      if (!res.ok) {
        setFeedback({
          type: "error",
          message:
            typeof body.detail === "string" ? body.detail : "Request failed",
        });
        return;
      }

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

  if (!token || !user) {
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
          Prints token and fresh_token (differs only after refresh). Sends
          X-Refresh-Token when access token is near expiry.
          (gateway terminal + JSON)
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
