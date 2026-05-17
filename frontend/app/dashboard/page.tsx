"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Feedback } from "@/components/feedback";
import {
  applyHelloSession,
  helloAuthHeaders,
  type HelloResponse,
} from "@/lib/hello";
import {
  applyProfileSession,
  type ProfileResponse,
} from "@/lib/profile";
import {
  authFetch,
  clearSession,
  getAccessToken,
  getAuthUser,
  type AuthUser,
} from "@/lib/session";

function ClaimsTable({ claims }: { claims: Record<string, unknown> }) {
  const rows = Object.entries(claims).filter(([, v]) => v !== undefined);
  if (!rows.length) return <p className="sub">No claims</p>;
  return (
    <table className="claims-table">
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <td>{key}</td>
            <td>
              {Array.isArray(value)
                ? value.join(", ")
                : typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [helloResult, setHelloResult] = useState<HelloResponse | null>(null);
  const [rawResult, setRawResult] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingHello, setLoadingHello] = useState(false);

  const refreshSessionUser = useCallback(() => {
    setUser(getAuthUser());
  }, []);

  useEffect(() => {
    if (!getAccessToken() || !getAuthUser()) {
      router.replace("/login");
      return;
    }
    refreshSessionUser();
    void loadProfile(false);
  }, [router, refreshSessionUser]);

  async function loadProfile(showFeedback = true) {
    setLoadingProfile(true);
    if (showFeedback) {
      setFeedback(null);
      setRawResult(null);
    }
    try {
      const res = await authFetch("/api/profile");
      const data: ProfileResponse = await res.json();
      if (!res.ok) {
        if (showFeedback) {
          setFeedback({
            type: "error",
            message: data.detail ?? "Failed to load profile",
          });
        }
        return;
      }
      setProfile(data);
      const updated = applyProfileSession(data);
      if (updated) setUser(updated);
      if (showFeedback) {
        setFeedback({ type: "success", message: "Profile loaded from gateway." });
        setRawResult(JSON.stringify(data, null, 2));
      }
    } catch {
      if (showFeedback) {
        setFeedback({
          type: "error",
          message: "Failed to fetch profile — is the gateway running?",
        });
      }
    } finally {
      setLoadingProfile(false);
    }
  }

  async function callHello() {
    setLoadingHello(true);
    setFeedback(null);
    setRawResult(null);

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

      setHelloResult(body);
      applyHelloSession(body);
      refreshSessionUser();
      setUser(getAuthUser());
      setFeedback({
        type: "success",
        message: body.refreshed
          ? "Hello OK — session refreshed (new access token)."
          : "Hello OK — token unchanged.",
      });
      setRawResult(JSON.stringify(body, null, 2));
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to fetch — is the gateway running on port 8000?",
      });
    } finally {
      setLoadingHello(false);
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

  const sessionClaims = user.jwt_claims ?? {
    sub: user.user_id,
    email: user.email ?? "",
    roles: user.roles,
    team: user.team,
    group: user.group,
    plan: user.plan,
  };

  return (
    <main className="page-wide">
      <div className="card">
        <h1>Test</h1>
        <p className="sub">Test session, profile (DB), and GET /hello</p>

        <ClaimsTable claims={sessionClaims as Record<string, unknown>} />

        {profile?.username && (
          <p className="sub sub-tight">
            username: <strong>{profile.username}</strong>
            {profile.updated_at && (
              <>
                {" "}
                · updated {profile.updated_at}
              </>
            )}
          </p>
        )}

        <div className="test-actions">
          <button
            type="button"
            className="btn"
            onClick={() => loadProfile(true)}
            disabled={loadingProfile}
          >
            {loadingProfile ? "Loading…" : "GET /profile"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={callHello}
            disabled={loadingHello}
          >
            {loadingHello ? "Loading…" : "GET /hello"}
          </button>
          <Link href="/profile" className="btn secondary">
            Edit profile
          </Link>
        </div>

        <button type="button" className="btn secondary" onClick={handleSignOut}>
          Sign out
        </button>
      </div>

      {feedback && (
        <Feedback type={feedback.type} message={feedback.message} />
      )}

      {helloResult?.trusted_headers && (
        <div className="card card-spaced">
          <h2 className="card-title">Trusted headers</h2>
          <p className="sub">From last GET /hello — for downstream services</p>
          <ClaimsTable
            claims={
              helloResult.trusted_headers as unknown as Record<string, unknown>
            }
          />
        </div>
      )}

      {helloResult && (
        <div className="card card-spaced">
          <h2 className="card-title">Hello summary</h2>
          <table className="claims-table">
            <tbody>
              <tr>
                <td>message</td>
                <td>{helloResult.message}</td>
              </tr>
              <tr>
                <td>refreshed</td>
                <td>{String(helloResult.refreshed ?? false)}</td>
              </tr>
              <tr>
                <td>expires_at</td>
                <td>{helloResult.expires_at ?? "—"}</td>
              </tr>
              <tr>
                <td>refresh_len</td>
                <td>{helloResult.refresh_token_length ?? "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {rawResult && (
        <div className="card card-spaced">
          <h2 className="card-title">Last response</h2>
          <pre className="result-pre">{rawResult}</pre>
        </div>
      )}

      <p className="nav-row sub">
        <Link href="/">Home</Link>
        <Link href="/profile">Profile</Link>
      </p>
    </main>
  );
}
