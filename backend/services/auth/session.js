import { signAccessToken, createRefreshToken, setAuthCookies } from "../../utils/tokenUtils.js";
import { storeRefreshToken } from "../../models/refreshTokenModel.js";

// Single entry point for starting a logged-in session: password sign-in, email
// verification, and both OAuth providers all issue the same cookie pair.
export async function startSession(res, user) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, expiresAt } = createRefreshToken();
  await storeRefreshToken(user.id, refreshToken, expiresAt);
  setAuthCookies(res, accessToken, refreshToken, expiresAt);
  return accessToken;
}

// What the client is allowed to know about the signed-in account. Anything that
// is not here is either secret (password, provider subject) or internal.
export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    email_verified: Boolean(user.email_verified),
    has_password: Boolean(user.password),
    has_google: Boolean(user.google_id),
    created_at: user.created_at,
  };
}
