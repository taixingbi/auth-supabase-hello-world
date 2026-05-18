"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Feedback } from "@/components/feedback";
import { saveAuthSession, type AuthResponse } from "@/lib/auth";
import { parseRecoveryHash } from "@/lib/recovery";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [tokens, setTokens] = useState<{
    access_token: string;
    refresh_token: string | null;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const parsed = parseRecoveryHash();
    if (!parsed?.access_token) {
      setFeedback({
        type: "error",
        message:
          "Missing reset token. Open the link from your email, or request a new one.",
      });
      return;
    }
    if (parsed.type && parsed.type !== "recovery") {
      setFeedback({
        type: "error",
        message: `Unexpected link type: ${parsed.type}. Use the password reset email.`,
      });
      return;
    }
    setTokens({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    });
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tokens) return;

    if (password !== confirm) {
      setFeedback({ type: "error", message: "Passwords do not match." });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? undefined,
          password,
        }),
      });
      const data: AuthResponse & { message?: string } = await res.json();

      if (!res.ok) {
        setFeedback({
          type: "error",
          message:
            typeof data.detail === "string"
              ? data.detail
              : "Could not reset password",
        });
        return;
      }

      if (saveAuthSession(data)) {
        setFeedback({
          type: "success",
          message: "Password updated. Redirecting…",
        });
        router.push("/profile");
        return;
      }

      setFeedback({
        type: "success",
        message:
          data.message ?? "Password updated. You can log in with your new password.",
      });
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
        <h1>Set new password</h1>
        <p className="sub">Choose a new password for your account.</p>

        <form onSubmit={handleSubmit}>
          <label className="sub" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            disabled={!tokens}
          />
          <label className="sub" htmlFor="confirm">
            Confirm password
          </label>
          <input
            id="confirm"
            className="field"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            disabled={!tokens}
          />
          <button className="btn" type="submit" disabled={loading || !tokens}>
            {loading ? "Saving…" : "Update password"}
          </button>
        </form>

        {feedback && (
          <Feedback type={feedback.type} message={feedback.message} />
        )}

        <p className="sub card-footer">
          <Link href="/login">← Log in</Link>
          {" · "}
          <Link href="/forgot-password">Request new link</Link>
        </p>
      </div>
    </main>
  );
}
