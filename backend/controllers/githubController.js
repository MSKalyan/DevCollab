import {
  findGithubAccountByUserId,
  upsertGithubAccount,
  findGithubAccountByGithubUserId,
  countEvidenceForAccount,
  countDistinctRepositoriesForAccount,
  deleteGithubAccountForUser,
} from "../models/githubAccountModel.js";
import { listSkillsForAccount } from "../models/skillEvidenceModel.js";
import { countEvidenceByType, listContributedRepositories } from "../models/evidenceModel.js";
import {
  buildAuthorizeUrl,
  generateState,
  stateCookieOptions,
  STATE_COOKIE_NAME,
  exchangeAuthorizationCode,
  resolveOAuthIdentity,
} from "../services/github/githubAuth.js";
import { encryptGithubToken } from "../utils/githubTokenCrypto.js";
import { enqueueBackfill } from "../jobs/queue.js";
import { sendError, sendServerError } from "../utils/response.js";
import { getCache, setCache, delCache } from "../utils/cache.js";

const frontendRedirect = () =>
  `${process.env.FRONTEND_URL || "http://localhost:3000"}/github`;

const statsFromRows = (rows) => {
  const byType = (rows || []).reduce((acc, row) => {
    acc[row.event_type] = Number(row.total);
    return acc;
  }, {});
  return {
    merged_prs: byType.MERGED_PR || 0,
    reviews: byType.PR_REVIEW || 0,
  };
};

// 1) Initiate the OAuth flow: require an authenticated DevCollab user, mint a
// CSRF state, then redirect the browser to GitHub.
export const initiateGithub = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  const state = generateState();
  res.cookie(STATE_COOKIE_NAME, state, stateCookieOptions());
  try {
    const url = buildAuthorizeUrl(state);
    return res.json({ success: true, data: { url } });
  } catch (err) {
    return sendServerError(res, err, "GitHub OAuth is not configured");
  }
};

// 2) GitHub redirects here with code + state after the user authorizes.
export const githubCallback = async (req, res) => {
  const { code, state, error } = req.query;
  const redirectOk = frontendRedirect();
  const redirectErr = (reason) => res.redirect(`${redirectOk}?error=${encodeURIComponent(reason)}`);

  // CSRF protection: fail closed when state is missing/mismatched.
  if (!state || state !== req.cookies?.[STATE_COOKIE_NAME]) {
    return redirectErr("invalid_state");
  }
  res.clearCookie(STATE_COOKIE_NAME, stateCookieOptions());

  if (error) return redirectErr(error);
  if (!code) return redirectErr("missing_code");

  // Callback runs in an authenticated browser session (cookies travel with the
  // same-origin redirect), but re-validate the DevCollab user defensively.
  if (!req.user) return redirectErr("unauthorized");
  const userId = req.user.id;

  try {
    const { accessToken, tokenExpiresAt } = await exchangeAuthorizationCode(code);

    const githubUser = await resolveOAuthIdentity(accessToken);
    const encrypted = encryptGithubToken(accessToken);

    // Prevent account hijacking: a github_user_id already linked to another
    // DevCollab user must not be claimable by this session.
    const existing = await findGithubAccountByGithubUserId(githubUser.id);
    if (existing && existing.user_id !== userId) {
      return redirectErr("github_account_linked_to_another_user");
    }

    await upsertGithubAccount({
      userId,
      githubUserId: githubUser.id,
      login: githubUser.login,
      name: githubUser.name || githubUser.login,
      avatarUrl: githubUser.avatar_url,
      profileUrl: githubUser.html_url,
      accessTokenEncrypted: encrypted,
      tokenExpiresAt,
    });

    // Backfill happens in the background worker; do not block the callback.
    const account = await findGithubAccountByUserId(userId);
    if (account) {
      await enqueueBackfill(account.id);
      await delCache(`github:user:${githubUser.id}`);
    }

    return res.redirect(redirectOk);
  } catch (err) {
    return redirectErr(err?.message || "github_oauth_failed");
  }
};

// GET /api/github/status
export const status = async (req, res) => {
  try {
    const account = await findGithubAccountByUserId(req.user.id);
    if (!account) {
      return res.json({ connected: false, backfill_status: "NOT_CONNECTED" });
    }

    const cached = await getCache(`github:backfill:${account.id}`);
    const statusToReport = cached || account.backfill_status;

    const [evidenceCount, skillCount, byType, stats] = await Promise.all([
      countEvidenceForAccount(account.id),
      countDistinctRepositoriesForAccount(account.id),
      countEvidenceByType(account.id),
      countDistinctRepositoriesForAccount(account.id, "CONTRIBUTED_REPOSITORY"),
    ]);

    const s = statsFromRows(byType);
    s.repositories = stats;

    return res.json({
      connected: true,
      github_username: account.login,
      avatar_url: account.avatar_url,
      name: account.name,
      backfill_status: statusToReport,
      backfill_error: account.backfill_error,
      last_synced_at: account.last_synced_at,
      evidence_count: evidenceCount,
      skill_count: skillCount,
      statistics: s,
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// GET /api/github/evidence
export const evidence = async (req, res) => {
  try {
    const account = await findGithubAccountByUserId(req.user.id);
    if (!account) {
      return res.json({
        connected: false,
        skills: [],
        statistics: { merged_prs: 0, repositories: 0, reviews: 0 },
      });
    }

    const cached = await getCache(`github:skills:${account.id}`);
    const skills = cached || (await listSkillsForAccount(account.id));
    if (!cached) await setCache(`github:skills:${account.id}`, skills, 300);

    const [byType, repositories, repoRows] = await Promise.all([
      countEvidenceByType(account.id),
      countDistinctRepositoriesForAccount(account.id, "CONTRIBUTED_REPOSITORY"),
      listContributedRepositories(account.id),
    ]);

    const s = statsFromRows(byType);
    s.repositories = repositories;

    const contributedRepositories = repoRows.map((r) => ({
      id: r.repo_id,
      fullName: r.repo_full_name,
      language: r.language,
      languages: r.metadata?.languages || [],
      topics: r.metadata?.topics || [],
      description: r.metadata?.description || null,
      sourceUrl: r.source_url,
      lastPushedAt: r.occurred_at,
    }));

    return res.json({
      connected: true,
      skills,
      statistics: s,
      repositories: contributedRepositories,
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// POST /api/github/backfill — manual retry trigger.
export const triggerBackfill = async (req, res) => {
  try {
    const account = await findGithubAccountByUserId(req.user.id);
    if (!account) {
      return sendError(res, 404, "Connect GitHub first");
    }
    await enqueueBackfill(account.id);
    return res.json({ success: true, message: "Backfill queued", backfill_status: "QUEUED" });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// DELETE /api/github/disconnect — unlink GitHub for the current user. Evidence
// and skills cascade-delete with the account row, freeing github_user_id so a
// (different) account can connect that GitHub identity later.
export const disconnectGithub = async (req, res) => {
  try {
    const account = await findGithubAccountByUserId(req.user.id);
    if (!account) {
      return sendError(res, 404, "GitHub is not connected");
    }
    const deleted = await deleteGithubAccountForUser(req.user.id);
    if (deleted) {
      await Promise.all([
        delCache(`github:backfill:${deleted.id}`),
        delCache(`github:skills:${deleted.id}`),
        delCache(`github:evidence:${deleted.id}`),
        delCache(`github:user:${deleted.github_user_id}`),
      ]);
    }
    return res.json({ success: true, message: "GitHub disconnected" });
  } catch (err) {
    return sendServerError(res, err);
  }
};