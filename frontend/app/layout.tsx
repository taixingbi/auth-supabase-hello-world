import Link from "next/link";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/">Home</Link>
          <Link href="/login">Login</Link>
          <Link href="/forgot-password">Forgot</Link>
          <Link href="/signup">Sign up</Link>
          <Link href="/dashboard">Test</Link>
          <Link href="/profile">Profile</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
