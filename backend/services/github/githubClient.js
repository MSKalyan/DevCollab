import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";

const ThrottledOctokit = Octokit.plugin(throttling);

// Normalized error thrown by the GitHub service layer so controllers never
// need to understand Octokit's error shape.
export class GithubApiError extends Error {
  constructor(message, { status = 500, retryAfter = null, response = null } = {}) {
    super(message);
    this.name = "GithubApiError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.response = response;
  }
}

function normalizeError(err) {
  const status = err?.status || err?.response?.status || 500;
  const message =
    err?.message || (err?.response?.data && err.response.data.message) || "GitHub API error";

  // 401/403: revoked/expired token or lack of permission.
  if (status === 401 || status === 403) {
    return new GithubApiError(message, { status, response: err });
  }
  // 429 or secondary rate limit: honor Retry-After if present.
  if (status === 429) {
    const retryAfter = parseInt(
      err?.response?.headers?.["retry-after"] || err?.retryAfter || "0",
      10
    );
    return new GithubApiError(message, { status, retryAfter, response: err });
  }
  return new GithubApiError(message, { status, response: err });
}

// Central GitHub client factory. `token` is a user access token already
// decrypted by the caller. `onRateLimit` lets workers hook monitoring/logging
// without scattering rate-limit logic through every call site.
export function createGithubClient(token, { onRateLimit = () => {} } = {}) {
  const octokit = new ThrottledOctokit({
    auth: token,
    userAgent: "DevCollab/1.0",
    throttle: {
      onRateLimit: (retryAfter, options, octokit) => {
        onRateLimit(retryAfter, options, octokit);
        // Throttling plugin retries the request automatically while honoring
        // the header. Returning true enables the retry.
        return true;
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        onRateLimit(retryAfter, options, octokit);
        return true;
      },
    },
  });

  return {
    octokit,
    // Page over a list endpoint. `fn(octokit, page, perPage)` should return the
    // array of items for that page; iteration stops at full-page confirmations
    // or maxPages. Every endpoint call goes through here or `request` so rate
    // limits are handled in one place.
    async paginate({ fn, perPage = 100, maxPages = 10 }) {
      const items = [];
      for (let page = 1; page <= maxPages; page += 1) {
        let data;
        try {
          data = await fn(octokit, page, perPage);
        } catch (err) {
          throw normalizeError(err);
        }
        const list = data || [];
        items.push(...list);
        if (list.length < perPage) break;
      }
      return items;
    },
    async request(fn) {
      try {
        const res = await fn(octokit);
        return res.data;
      } catch (err) {
        throw normalizeError(err);
      }
    },
  };
}

// Injected octokit-shaped client for tests: holds the raw instance so tests
// can stub methods directly.
export function createStubClient(stubOctokit) {
  return {
    octokit: stubOctokit,
    async paginate({ fn, perPage = 100, maxPages = 10 }) {
      const items = [];
      for (let page = 1; page <= maxPages; page += 1) {
        const data = await fn(stubOctokit, page, perPage);
        const list = data || [];
        items.push(...list);
        if (list.length < perPage) break;
      }
      return items;
    },
    async request(fn) {
      const res = await fn(stubOctokit);
      return res?.data;
    },
  };
}