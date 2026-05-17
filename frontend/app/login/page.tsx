"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Feedback } from "@/components/feedback";
import { formatAuthError } from "@/lib/auth-errors";
import { setSession } from "@/lib/session";

type LoginResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { user_id: string; email: string | null; roles: string[] };
  detail?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data: LoginResponse = await res.json();

      if (!res.ok) {
        const detail =
          typeof data.detail === "string" ? data.detail : "Login failed";
        setFeedback({
          type: "error",
          message: formatAuthError(detail, "login"),
        });
        return;
      }

      if (!data.access_token || !data.user) {
        setFeedback({ type: "error", message: "No session returned" });
        return;
      }

      setSession(
        data.access_token,
        data.user,
        data.refresh_token,
        data.expires_in,
      );
      setFeedback({ type: "success", message: "Login successful. Redirecting…" });
      router.push("/profile");
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to fetch — is the gateway running on port 8000?",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <div className="card">
        <h1>Log in</h1>
        <p className="sub">Gateway auth → JWT (sub, email, roles)</p>

        <form onSubmit={handleLogin}>
          <input
            className="field"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            className="field"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        {feedback && (
          <Feedback type={feedback.type} message={feedback.message} />
        )}

        <p className="sub" style={{ marginTop: "1.25rem", marginBottom: 0 }}>
          No account? <Link href="/signup">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
