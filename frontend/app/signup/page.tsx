"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Feedback } from "@/components/feedback";
import { saveAuthSession, type AuthResponse } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data: AuthResponse = await res.json();

      if (!res.ok) {
        setFeedback({
          type: "error",
          message:
            typeof data.detail === "string" ? data.detail : "Signup failed",
        });
        return;
      }

      if (saveAuthSession(data)) {
        setFeedback({
          type: "success",
          message: "Sign up successful. Redirecting…",
        });
        router.push("/profile");
        return;
      }

      setFeedback({
        type: "success",
        message:
          "Sign up successful. Confirm your email (if required), then log in.",
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
        <h1>Sign up</h1>
        <p className="sub">Gateway → Supabase user DB</p>

        <form onSubmit={handleSignup}>
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
            minLength={6}
            autoComplete="new-password"
          />
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Signing up…" : "Sign up"}
          </button>
        </form>

        {feedback && (
          <Feedback type={feedback.type} message={feedback.message} />
        )}

        <p className="sub card-footer">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
