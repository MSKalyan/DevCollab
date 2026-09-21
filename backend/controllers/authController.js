import bcrypt from "bcryptjs";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
} from "../utils/tokenUtils.js";
import { sendPasswordResetEmail, sendVerificationCodeEmail } from "../utils/mailer.js";
import {
  generateOtp,
  hashOtp,
  otpExpiresAt,
  otpMatches,
  resendCooldownRemaining,
  OTP_MAX_ATTEMPTS,
} from "../utils/otpUtils.js";
import {
  deleteUserPasswordResetTokens,
  storePasswordResetToken,
  findPasswordResetToken,
  claimPasswordResetToken,
} from "../models/passwordResetModel.js";
import {
  consumeVerificationCode,
  deleteUserVerificationCodes,
  findLatestVerificationCode,
  incrementVerificationAttempts,
  storeVerificationCode,
} from "../models/emailVerificationModel.js";
import {
  deleteAllUserRefreshTokens,
  deleteRefreshToken,
  findRefreshToken,
} from "../models/refreshTokenModel.js";
import { clearAuthCookies } from "../utils/tokenUtils.js";
import { startSession, publicUser } from "../services/auth/session.js";
import { verifyGoogleIdToken } from "../services/google/googleAuth.js";
import { normalizeEmail } from "../utils/email.js";
import { sendError, sendServerError } from "../utils/response.js";
import {
  createContactRequest,
  createUser,
  getDevelopers,
  getUserByEmail,
  getUserByGoogleId,
  getUserById,
  getUserProfile,
  linkGoogleAccount,
  markEmailVerified,
  updateUserNameAndPassword,
  updateUserPassword,
} from "../models/userModel.js";
import {
  findGithubAccountByUserId,
  countDistinctRepositoriesForAccount,
} from "../models/githubAccountModel.js";
import { countEvidenceByType, listContributedRepositories } from "../models/evidenceModel.js";
import { listSkillsForAccount } from "../models/skillEvidenceModel.js";

// Mails a fresh one-time code and makes it the only live code for that user.
// The raw code is never returned to the caller: it travels by email only.
async function issueVerificationCode(user) {
  const code = generateOtp();
  await storeVerificationCode(user.id, hashOtp(code), otpExpiresAt());
  try {
    await sendVerificationCodeEmail(user.email, code);
  } catch (err) {
    // A failed send must not strand the user behind a code they never got.
    await deleteUserVerificationCodes(user.id);
    throw err;
  }
}

// Registers the account in an unverified state and emails a code. No session is
// issued: the address must be proved before any cookies are handed out.
export const postRegister = async (req, res) => {
  const name = String(req.body.name).trim();
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  try {
    const existing = await getUserByEmail(email);

    if (existing && existing.email_verified) {
      return res
        .status(409)
        .json({ success: false, message: "Email already registered." });
    }

    if (existing) {
      // A pending registration for this address is never password-overwritten:
      // anyone who knows the address could otherwise plant a password and take
      // the account over as soon as the real owner verifies. The code is
      // re-sent instead, and a mistyped password is fixed via password reset
      // after verification.
      await issueVerificationCode(existing);
      return res.status(200).json({
        success: true,
        verification_required: true,
        message: "We sent a new verification code to your email.",
        data: { email },
      });
    }

    const user = await createUser({
      name,
      email,
      password: await bcrypt.hash(password, 10),
    });

    try {
      await issueVerificationCode(user);
    } catch (mailErr) {
      // Roll the row back: an account nobody can verify is worse than none.
      await deleteUserVerificationCodes(user.id);
      return sendServerError(res, mailErr, "Could not send the verification email.");
    }

    return res.status(201).json({
      success: true,
      verification_required: true,
      message: "Account created. Check your email for the verification code.",
      data: { email },
    });
  } catch (error) {
    if (error && error.code === "23505") {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }
    return sendServerError(res, error, "Error registering user.");
  }
};

// Confirms the emailed code and only then starts the session.
export const verifyEmail = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.code).trim();

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return sendError(res, 400, "This verification code is invalid or has expired.");
    }
    if (user.email_verified) {
      return sendError(res, 400, "This email is already verified. Please sign in.");
    }

    const record = await findLatestVerificationCode(user.id);
    if (!record || record.consumed_at || new Date(record.expires_at) < new Date()) {
      return sendError(res, 400, "This verification code is invalid or has expired.");
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      return sendError(res, 429, "Too many incorrect codes. Request a new one.");
    }

    if (!otpMatches(code, record.code_hash)) {
      await incrementVerificationAttempts(record.id);
      const left = Math.max(0, OTP_MAX_ATTEMPTS - (record.attempts + 1));
      return sendError(
        res,
        400,
        left > 0
          ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`
          : "Too many incorrect codes. Request a new one."
      );
    }

    // Burn the code before touching the account so it is single-use even when
    // two requests race.
    const claimed = await consumeVerificationCode(record.id);
    if (!claimed) {
      return sendError(res, 400, "This verification code is invalid or has expired.");
    }

    const verified = await markEmailVerified(user.id);
    await deleteUserVerificationCodes(user.id);
    await startSession(res, verified || user);

    return res.json({
      success: true,
      message: "Email verified. Welcome to DevCollab!",
      data: { user: publicUser(verified || user) },
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// Sends another code, subject to the per-code cooldown so the endpoint cannot be
// used to flood an inbox. The IP-level limiter bounds unauthenticated abuse.
export const resendVerification = async (req, res) => {
  const email = normalizeEmail(req.body.email);

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return sendError(res, 404, "No account found with that email.");
    }
    if (user.email_verified) {
      return sendError(res, 400, "This email is already verified. Please sign in.");
    }

    const live = await findLatestVerificationCode(user.id);
    const wait = resendCooldownRemaining(live?.created_at);
    if (wait > 0) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${wait}s before requesting another code.`,
        retry_after: wait,
      });
    }

    await issueVerificationCode(user);
    return res.json({
      success: true,
      message: "A new verification code is on its way.",
      data: { email, retry_after: 60 },
    });
  } catch (err) {
    return sendServerError(res, err, "Could not send the verification email.");
  }
};

export const postLogin = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  try {
    const user = await getUserByEmail(email);

    if (!user) {
      return sendError(res, 400, "Invalid email or password.");
    }

    // Unverified accounts cannot sign in. A code is re-sent when none is live so
    // the client can hand the user straight to the verification screen.
    if (!user.email_verified) {
      const live = await findLatestVerificationCode(user.id);
      const missingCode = !live || live.consumed_at || new Date(live.expires_at) < new Date();
      let codeSent = false;
      if (missingCode && resendCooldownRemaining(live?.created_at) === 0) {
        try {
          await issueVerificationCode(user);
          codeSent = true;
        } catch (mailErr) {
          console.error("Verification email failed:", mailErr?.message || mailErr);
        }
      }
      return res.status(403).json({
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        code_sent: codeSent,
        message: "Verify your email address to finish signing in.",
        data: { email: user.email },
      });
    }

    // OAuth-only accounts have no password to compare against; bcrypt would
    // throw on a null hash, so this is checked before comparing.
    if (!user.password) {
      return sendError(res, 400, "This account has no password. Sign in with Google or GitHub.");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(res, 400, "Invalid email or password.");
    }

    await startSession(res, user);

    res.json({
      success: true,
      message: "Login successful",
      role: user.role,
      data: { user: publicUser(user) },
    });
  } catch (err) {
    return sendServerError(res, err, "Server error");
  }
};

// Google Sign-In: the browser sends the Google ID token, the backend verifies it
// against Google's keys, and an account is created or matched by the verified
// address. An unverified Google address is refused outright.
export const googleLogin = async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return sendError(res, 400, "Missing Google credential");
  }

  try {
    const identity = await verifyGoogleIdToken(credential);

    if (!identity.email) {
      return sendError(res, 401, "Google did not provide an email address.");
    }
    if (!identity.emailVerified) {
      return sendError(res, 403, "Your Google email address is not verified.");
    }

    const email = normalizeEmail(identity.email);

    // Match the Google identity first: it is the stable key. If the user later
    // changes the address on their Google account, a subject match still finds
    // the same DevCollab account instead of colliding with the unique google_id
    // index while trying to create a second one.
    let user = identity.subject ? await getUserByGoogleId(identity.subject) : null;

    if (!user) {
      user = await getUserByEmail(email);
    }

    if (!user) {
      user = await createUser({
        name: identity.name || email.split("@")[0],
        email,
        // Google vouched for this address, so no OTP round-trip is needed.
        emailVerified: true,
        googleId: identity.subject,
      });
    } else {
      const emailOwner = await getUserByEmail(email);
      if (emailOwner && emailOwner.id !== user.id) {
        // Another account already holds this address. Refusing is the only safe
        // answer: handing over that account would be a takeover, and creating a
        // second row for the address is impossible (unique email).
        return sendError(
          res,
          409,
          "This email address is already registered to another account."
        );
      }
      if (!user.google_id && identity.subject) {
        // Matching address, no Google link yet: link the identity so the user can
        // sign in either way from now on.
        user = (await linkGoogleAccount(user.id, identity.subject)) || user;
      }
      if (!user.email_verified) {
        user = (await markEmailVerified(user.id)) || user;
      }
    }

    await startSession(res, user);
    return res.json({
      success: true,
      message: "Google login successful",
      data: { user: publicUser(user) },
    });
  } catch (err) {
    console.error("Google login failed:", err?.message || err);
    return sendError(res, 401, "Invalid Google token");
  }
};

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refresh_token;
    if (refreshToken) {
      // Revoke the refresh token so any copied JWT can no longer be refreshed.
      await deleteRefreshToken(refreshToken);
    }
    if (req.user && req.user.id) {
      // Revoke every refresh token for the user as a safety measure.
      await deleteAllUserRefreshTokens(req.user.id);
    }
  } catch (err) {
    console.error("Logout error:", err);
  }

  // Clear the auth cookies so the browser drops them.
  clearAuthCookies(res);
  return res.json({ success: true, message: "Logged out successfully" });
};

// Rotate the access token using a valid refresh token cookie.
export const refresh = async (req, res) => {
  const refreshToken = req.cookies.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ success: false, message: "No refresh token" });
  }

  const stored = await findRefreshToken(refreshToken);
  if (!stored) {
    clearAuthCookies(res);
    return res
      .status(401)
      .json({ success: false, message: "Invalid refresh token" });
  }

  if (new Date(stored.expires_at).getTime() < Date.now()) {
    await deleteRefreshToken(refreshToken);
    clearAuthCookies(res);
    return res
      .status(401)
      .json({ success: false, message: "Refresh token expired" });
  }

  const user = await getUserById(stored.user_id);
  if (!user) {
    await deleteRefreshToken(refreshToken);
    clearAuthCookies(res);
    return res.status(401).json({ success: false, message: "User not found" });
  }

  // Rotate: revoke the old refresh token and issue a fresh pair.
  await deleteRefreshToken(refreshToken);
  const accessToken = await startSession(res, user);

  return res.json({ success: true, data: { accessToken, user: publicUser(user) } });
};

// The client's bootstrap: what the session belongs to. Read from the database
// rather than the JWT claims so profile fields stay current after an edit.
export const me = async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return sendError(res, 401, "Authentication required");
    return res.json(publicUser(user));
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const updateProfile = async (req, res) => {
  const userId = req.user.id;
  const { name, password } = req.body;

  try {
    // If password is provided, hash it
    const hashedPassword =
      password && password.trim() !== "" ? await bcrypt.hash(password, 10) : null;

    await updateUserNameAndPassword(userId, name, hashedPassword);

    return res.json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
};

export const listDevelopers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 12, 1), 50);
    const { search = "" } = req.query;
    const { developers, total } = await getDevelopers(page, limit, search);
    res.json({ success: true, data: { developers, page, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const getDeveloperProfile = async (req, res) => {
  try {
    const developer = await getUserProfile(req.params.id);
    if (!developer) return sendError(res, 404, "Developer not found");
    const github = await buildGithubSnapshot(developer.id);
    const { email, ...publicDeveloper } = developer;
    res.json({ success: true, data: { developer: publicDeveloper, github } });
  } catch (err) { return sendServerError(res, err); }
};

// Public GitHub evidence snapshot for a user's profile page. Returns null when
// the developer has not connected GitHub, so viewers just see the regular
// profile fields. Only public data is exposed — never the access token.
export async function buildGithubSnapshot(userId) {
  const account = await findGithubAccountByUserId(userId);
  if (!account) return null;

  const [byType, skills, repositories, repoCount] = await Promise.all([
    countEvidenceByType(account.id),
    listSkillsForAccount(account.id),
    listContributedRepositories(account.id),
    countDistinctRepositoriesForAccount(account.id, "CONTRIBUTED_REPOSITORY"),
  ]);

  const byTypeMap = (byType || []).reduce((acc, row) => {
    acc[row.event_type] = Number(row.total);
    return acc;
  }, {});

  return {
    connected: true,
    username: account.login,
    name: account.name,
    avatar_url: account.avatar_url,
    profile_url: account.profile_url,
    backfill_status: account.backfill_status,
    last_synced_at: account.last_synced_at,
    statistics: {
      merged_prs: byTypeMap.MERGED_PR || 0,
      reviews: byTypeMap.PR_REVIEW || 0,
      repositories: repoCount,
    },
    skills,
    repositories: repositories.map((r) => ({
      id: r.repo_id,
      fullName: r.repo_full_name,
      language: r.language,
      languages: r.metadata?.languages || [],
      topics: r.metadata?.topics || [],
      description: r.metadata?.description || null,
      sourceUrl: r.source_url,
      lastPushedAt: r.occurred_at,
    })),
  };
}

export const requestContact = async (req, res) => {
  const recipientId = Number(req.params.id);
  try {
    const developer = await getUserProfile(recipientId);
    if (!developer) return sendError(res, 404, "Developer not found");
    const request = await createContactRequest(
      recipientId,
      req.user.id,
      req.body?.message?.trim() || null
    );
    res.status(201).json({ success: true, data: { request }, message: "Contact request sent" });
  } catch (err) { return sendServerError(res, err); }
};

export const forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body.email);

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return sendError(res, 404, "No account found with that email.");
    }

    const { token, tokenHash, expiresAt } = createPasswordResetToken();
    await storePasswordResetToken(user.id, tokenHash, expiresAt);

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (mailErr) {
      // A failed send must not strand the user with a token they never got.
      await deleteUserPasswordResetTokens(user.id);
      return sendServerError(res, mailErr, "Could not send the reset email.");
    }
    return res.json({ success: true, message: "A password reset link has been sent to your email." });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  try {
    const record = await findPasswordResetToken(hashPasswordResetToken(token.trim()));
    if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
      return sendError(res, 400, "This reset link is invalid or has expired.");
    }

    // Burn the token before touching the password so the link is single-use
    // even if two requests race.
    const claimed = await claimPasswordResetToken(record.id);
    if (!claimed) {
      return sendError(res, 400, "This reset link is invalid or has expired.");
    }

    await updateUserPassword(record.user_id, await bcrypt.hash(password, 10));

    // A password change invalidates every existing session for that account.
    await deleteAllUserRefreshTokens(record.user_id);
    await deleteUserPasswordResetTokens(record.user_id);
    clearAuthCookies(res);

    return res.json({
      success: true,
      message: "Password updated. You can sign in with your new password.",
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};
