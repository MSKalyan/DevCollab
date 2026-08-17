// Pull-request evidence: the user's merged PRs and the files they changed.

// Search for PRs authored by the user that were merged. `search/issues` is a
// dependable, deterministic record of merged PRs (unlike the events stream).
// Returns merged PR objects only.
export async function listMergedPullRequests(client, login, { perPage = 100, maxPages = 10 } = {}) {
  return client.paginate({
    perPage,
    maxPages,
    fn: (octokit, page) =>
      octokit.rest.search
        .issuesAndPullRequests({
          q: `author:${login} type:pr is:merged`,
          per_page: perPage,
          page,
        })
        .then((res) => res.data.items),
  });
}

// Files changed in a PR body -> file extension -> language. Only first page is
// used by the backfill to bound API cost.
export async function listPullRequestFiles(client, owner, repo, pullNumber, { perPage = 100, maxPages = 1 } = {}) {
  return client.paginate({
    perPage,
    maxPages,
    fn: (octokit, page) =>
      octokit.rest.pulls
        .listFiles({ owner, repo, pull_number: pullNumber, per_page: perPage, page })
        .then((res) => res.data),
  });
}