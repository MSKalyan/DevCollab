// Repository discovery for a user's evidence profile.

// Repositories the authenticated user owns or collaborates on. Excludes forks
// (a fork is not meaningful contribution evidence unless the user has merged
// PRs into it, which is handled by the PR paths).
export async function listUserRepositories(client, login, { perPage = 100, maxPages = 10 } = {}) {
  return client.paginate({
    perPage,
    maxPages,
    fn: (octokit, page) =>
      octokit.rest.repos
        .listForAuthenticatedUser({
          affiliation: "owner,collaborator",
          per_page: perPage,
          sort: "updated",
          page,
        })
        .then((res) => res.data),
  });
}

// Resolve language stats for a repo (bytes per language). Used to weight skill
// extraction by actual code, not just the repo's single primary language.
export async function getRepositoryLanguages(client, owner, repo) {
  const data = await client.request((octokit) =>
    octokit.rest.repos.listLanguages({ owner, repo })
  );
  return data || {};
}

// Fetch repo-level topics (subject to repo API having topics enabled).
export async function getRepository(client, owner, repo) {
  return client.request((octokit) => octokit.rest.repos.get({ owner, repo }));
}