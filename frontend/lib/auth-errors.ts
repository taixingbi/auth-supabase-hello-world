export function formatAuthError(
  message: string,
  context: "login" | "signup",
  code?: string,
): string {
  if (
    code === "email_not_confirmed" ||
    message.toLowerCase().includes("email not confirmed")
  ) {
    return [
      "Email not confirmed yet.",
      "Open the confirmation link Supabase sent to your inbox, then log in again.",
      "For local dev: Supabase Dashboard → Authentication → Providers → Email → turn off “Confirm email”.",
    ].join("\n");
  }

  if (message === "Invalid login credentials" && context === "login") {
    return [
      "Invalid login credentials.",
      "• Use the email or username from your profile",
      "• Sign up at /signup if you do not have an account",
      "• Wrong password? Use Forgot password on this page",
      "• Email confirmation on? Confirm your email or disable it in Supabase",
    ].join("\n");
  }

  return message;
}
