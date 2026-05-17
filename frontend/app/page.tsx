import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="card">
        <h1>Hello Auth</h1>
        <p className="sub">
          Next.js → Gateway (signup, login, JWT verify)
        </p>
        <Link
          href="/signup"
          className="btn"
          style={{ display: "block", textAlign: "center", textDecoration: "none" }}
        >
          Create account
        </Link>
        <Link
          href="/login"
          className="btn secondary"
          style={{ display: "block", textAlign: "center", textDecoration: "none" }}
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
