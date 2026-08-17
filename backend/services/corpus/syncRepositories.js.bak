// Phase 2 repository sync: refresh metadata for every curated repository and
// ensure new curated repos (added to config/schema) appear as rows. Idempotent
// and rate-limit-safe — uses the shared client.

import { createGithubClient, createStubClient } from "../github/githubClient.js";
import {
  getRepository,
  getRepositoryLanguages,
  getRepositoryTopics,
  repositoryMetadataFromGitHub,
} from "../github/githubRepoMeta.js";
import {
  listAllCuratedRepositories,
  findCuratedRepositoryByFullName,
  upsertCuratedRepository,
  updateCuratedRepositoryMetadata,
} from "../../models/curatedRepositoryModel.js";
import { curatedRepoSeed } from "../../config/curatedRepositories.js";

// Ensure every configured curated repo exists in the DB (schema seed may not
// have run, or new entries were added to config).
async function ensureCuratedRows() {
  const seeds = curatedRepoSeed();
  const created = [];
  for (const seed of seeds) {
    const existing = await findCuratedRepositoryByFullName(seed.fullName);
    if (!existing) {
      await upsertCuratedRepository(seed);
      created.push(seed.fullName);
    }
  }
  return created;
}

function pickRateToken() {
  // Public API works without a token (lower rate limit). An optional read-only
  // token raises the ceiling for the corpus sync; never a user access token.
  return process.env.GITHUB_CORPUS_TOKEN || undefined;
}

// Sync metadata for all curated repositories. Returns a metrics object.
// `client` injectable for tests.
export async function syncCuratedRepositories({ client } = {}) {
  const metrics = {
    repositories_found: 0,
    repositories_updated: 0,
    repositories_failed: 0,
    repos_created: [],
    errors: [],
  };

  const activeClient =
    client ||
    (process.env.NODE_ENV === "test"
      ? createStubClient({}) // tests inject their own client
      : createGithubClient(pickRateToken()));

  metrics.repos_created = await ensureCuratedRows();
  const repos = await listAllCuratedRepositories();
  metrics.repositories_found = repos.length;

  for (const repo of repos) {
    try {
      if (!repo.owner || !repo.name) continue;
      const ghRepo = await getRepository(activeClient, repo.owner, repo.name);
      const [languages, topics] = await Promise.allSettled([
        getRepositoryLanguages(activeClient, repo.owner, repo.name),
        getRepositoryTopics(activeClient, repo.owner, repo.name),
      ]);
      if (topics.status === "rejected") {
        // A 403 here almost always means topics are disabled for this repo
        // (or, rarely, the anonymous rate cap was hit) — not a sync failure.
        const reason = topics.reason;
        const detail =
          reason?.status === 403
            ? "topics disabled for this repo (403)"
            : reason?.message || "unknown error";
        console.warn(`[repo sync] topics unavailable for ${repo.full_name}: ${detail}`);
      }
      const metadata = repositoryMetadataFromGitHub(ghRepo, {
        languages: languages.status === "fulfilled" ? languages.value : {},
        topics: topics.status === "fulfilled" ? topics.value : [],
      });
      await updateCuratedRepositoryMetadata(repo.id, metadata);
      metrics.repositories_updated += 1;
    } catch (err) {
      metrics.repositories_failed += 1;
      metrics.errors.push({
        repo: repo.full_name,
        message: err?.message || "repository sync failed",
      });
    }
  }

  return metrics;
}