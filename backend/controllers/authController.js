import bcrypt from "bcryptjs";
import pool from '../models/db.js'; // database connection
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
console.log("Google credential received:", credential);
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
    let userResult = await pool.query("SELECT * FROM users WHERE email=$1", [email]);

    let user;
    if (userResult.rows.length === 0) {
      // ✅ Create user if not exists
      const newUser = await pool.query(
        "INSERT INTO users (name,email,role,password) VALUES ($1,$2,$3,$4) RETURNING *",
        [name, email, "user", "GOOGLE_OAUTH"] // or null
      );
      user = newUser.rows[0];
    } else {
      user = userResult.rows[0];
    }

    // ✅ Create your app JWT token (set as httpOnly cookies)
    await issueTokens(res, user);

    return res.json({ success: true, message: "Google login successful" });
  } catch (err) {
    console.error(err);
    return res.status(401).json({ message: "Invalid Google token" });
  }
};
export const getLogin = (req, res) => {
  res.json({message:'Login endpoint'});
};

export const postLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    // If user not found
    if (userResult.rows.length === 0) {
      return sendError(res, 400, 'Invalid email or password.');
    }

    const user = userResult.rows[0];
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

  }
  catch (err) {
    return sendServerError(res, err, 'Server error');
  }
};

export const getRegister = (req, res) => {
  res.json({message:'Register endpoint'});
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
    const result = await pool.query(
      'INSERT INTO users (name, email, password, created_at, role) VALUES ($1, $2, $3, NOW(), $4) RETURNING *',
      [name, email, hashedPassword, 'user'] // Default role is 'user'
    );

    const newUser = result.rows[0];

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

  const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [
    stored.user_id,
  ]);
  if (userResult.rows.length === 0) {
    await deleteRefreshToken(refreshToken);
    clearAuthCookies(res);
    return res.status(401).json({ success: false, message: "User not found" });
  }

  const user = userResult.rows[0];

  // Rotate: revoke the old refresh token and issue a fresh pair.
  await deleteRefreshToken(refreshToken);
  const accessToken = await issueTokens(res, user);

  return res.json({ success: true, accessToken });
};

export const updateProfile = async (req, res) => {
  const userId = req.user.id;
  const { name, password } = req.body;

  try {
    // If password is provided, hash it
    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);

      await pool.query(
        "UPDATE users SET name = $1, password = $2 WHERE id = $3",
        [name, hashedPassword, userId]
      );
    } else {
      // Update only name
      await pool.query(
        "UPDATE users SET name = $1 WHERE id = $2",
        [name, userId]
      );
    }

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