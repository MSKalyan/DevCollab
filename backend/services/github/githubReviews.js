// Review evidence: PRs where the authenticated user participated as a reviewer.

// GitHub's search supports `reviewed-by`; this is the deterministic record of
// reviews the user has added (not a pull of every repo's review activity).
export async function listUserReviewedPullRequests(client, login, { perPage = 100, maxPages = 10 } = {}) {
  // The search API does not return the review itself, but it returns the PR
  // the user reviewed, which is enough to mint a PR_REVIEW evidence event.
  return client.paginate({
    perPage,
    maxPages,
    fn: (octokit, page) =>
      octokit.rest.search
        .issuesAndPullRequests({
          q: `reviewed-by:${login} type:pr`,
          per_page: perPage,
          page,
        })
        .then((res) => res.data.items),
  });
}