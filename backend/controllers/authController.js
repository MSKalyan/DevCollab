import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import {
  signAccessToken,
  createRefreshToken,
  setAuthCookies,
  clearAuthCookies,
} from "../utils/tokenUtils.js";
import {
  storeRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
  deleteAllUserRefreshTokens,
} from "../models/refreshTokenModel.js";
import { sendError, sendServerError } from "../utils/response.js";
import {
  createContactRequest,
  createUser,
  getDevelopers,
  getUserByEmail,
  getUserById,
  getUserProfile,
  getUserProjects,
  updateUserNameAndPassword,
} from "../models/userModel.js";
import {
  findGithubAccountByUserId,
  countDistinctRepositoriesForAccount,
} from "../models/githubAccountModel.js";
import { countEvidenceByType, listContributedRepositories } from "../models/evidenceModel.js";
import { listSkillsForAccount } from "../models/skillEvidenceModel.js";


const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Issue access + refresh tokens and attach them as httpOnly cookies.
async function issueTokens(res, user) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, expiresAt } = createRefreshToken();
  await storeRefreshToken(user.id, refreshToken, expiresAt);
  setAuthCookies(res, accessToken, refreshToken, expiresAt);
  return accessToken;
}

export const googleLogin = async (req, res) => {
  const { credential } = req.body;
  try {
    if (!credential) {
      return res.status(400).json({ message: "Missing Google credential" });
    }

    // ✅ Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;

    // ✅ Find user in DB
    const existing = await getUserByEmail(email);

    let user;
    if (!existing) {
      // ✅ Create user if not exists
      user = await createUser(name, email, "GOOGLE_OAUTH");
    } else {
      user = existing;
    }

    // ✅ Create your app JWT token (set as httpOnly cookies)
    await issueTokens(res, user);

    return res.json({ success: true, message: "Google login successful" });
  } catch (err) {
    console.error(err);
    return res.status(401).json({ message: "Invalid Google token" });
  }
};
export const postLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await getUserByEmail(email);

    // If user not found
    if (!user) {
      return sendError(res, 400, 'Invalid email or password.');
    }
    const isMatch = await bcrypt.compare(password, user.password);

    // If password does not match
    if (!isMatch) {
      return sendError(res, 400, 'Invalid email or password.');
    }

    // Generate JWT tokens (set as httpOnly cookies)
    await issueTokens(res, user);

    res.json({
      success: true,
      message: "Login successful",
      role: user.role
    });
  } catch (err) {
    return sendServerError(res, err, 'Server error');
  }
};

export const postRegister = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return sendError(res, 400, "Name, email, and password are required.");
  }

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database
    const newUser = await createUser(name, email, hashedPassword);

    // Generate JWT tokens (set as httpOnly cookies)
    await issueTokens(res, newUser);

    res.status(201).json({success:true,message:'User registered successfully'});
  } catch (error) {
    if (error && error.code === "23505") {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }
    return sendServerError(res, error, 'Error registering user.');
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
  const accessToken = await issueTokens(res, user);

  return res.json({ success: true, data: { accessToken } });
};

export const me = (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    role: req.user.role,
  });
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
    const { search = "", tech = "" } = req.query;
    const { developers, total } = await getDevelopers(page, limit, search, tech);
    res.json({ success: true, data: { developers, page, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const getDeveloperProfile = async (req, res) => {
  try {
    const developer = await getUserProfile(req.params.id);
    if (!developer) return sendError(res, 404, "Developer not found");
    const [projects, github] = await Promise.all([
      getUserProjects(req.params.id),
      buildGithubSnapshot(developer.id),
    ]);
    const { email, ...publicDeveloper } = developer;
    res.json({ success: true, data: { developer: publicDeveloper, projects, github } });
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
  if (recipientId === req.user.id) return sendError(res, 400, "You cannot contact yourself");
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
