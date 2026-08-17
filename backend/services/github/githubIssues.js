// Issue discovery for the corpus pipeline. All calls go through the shared
// github client so throttling/rate-limit behavior stays centralized.

// open issues for a repo. GitHub returns PRs through the issues endpoint too,
// so callers must filter is_pull_request. `since` is ISO8601 (updated >= since).
export async function listOpenIssues(client, owner, repo, { perPage = 100, maxPages = 10, since = null } = {}) {
  return client.paginate({
    perPage,
    maxPages,
    fn: (octokit, page) =>
      octokit.rest.issues
        .listForRepo({
          owner,
          repo,
          state: "open",
          per_page: perPage,
          page,
          ...(since ? { since } : {}),
        })
        .then((res) => res.data),
  });
}

// Full issue (rarely needed; the list endpoint already returns everything we
// store for issues — kept here for completeness/consistency with the pipeline).
export async function getIssue(client, owner, repo, issueNumber) {
  const data = await client.request((octokit) =>
    octokit.rest.issues.get({ owner, repo, issue_number: issueNumber })
  );
  return data;
}