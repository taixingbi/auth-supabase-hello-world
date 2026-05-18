"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Feedback } from "@/components/feedback";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFeedback({
          type: "error",
          message:
            typeof data.detail === "string"
              ? data.detail
              : "Could not send reset email",
        });
        return;
      }

      setFeedback({
        type: "success",
        message:
          data.message ??
          "If an account exists for that email, a reset link was sent. Check your inbox.",
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
        <h1>Forgot password</h1>
        <p className="sub">
          We will email you a link to set a new password. Add{" "}
          <code style={{ fontSize: "0.8em" }}>
            {typeof window !== "undefined"
              ? `${window.location.origin}/auth/reset-password`
              : "/auth/reset-password"}
          </code>{" "}
          to Supabase → Authentication → URL configuration.
        </p>

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
            required
            autoComplete="email"
          />
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>

        {feedback && (
          <Feedback type={feedback.type} message={feedback.message} />
        )}

        <p className="sub card-footer">
          <Link href="/login">← Back to log in</Link>
        </p>
      </div>
    </main>
  );
}
