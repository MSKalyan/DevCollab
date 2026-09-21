// Addresses are stored and compared in one canonical form. Registration,
// sign-in, verification, and OAuth all funnel through here so `User@Example.com`
// and `user@example.com` are the same account.
export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}
