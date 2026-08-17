// Repository metadata for curated repositories. Uses the shared github client.

// Full repo object (used to persist metadata for a curated repo).
export async function getRepository(client, owner, repo) {
  return client.request((octokit) =>
    octokit.rest.repos.get({ owner, repo })
  );
}

export async function getRepositoryLanguages(client, owner, repo) {
  return client.request((octokit) =>
    octokit.rest.repos.listLanguages({ owner, repo })
  );
}

export async function getRepositoryTopics(client, owner, repo) {
  const data = await client.request((octokit) =>
    octokit.rest.repos.getAllTopics({ owner, repo })
  );
  return data?.names || [];
}

// Derive the stored metadata shape from a GitHub repo object + languages/topics.
export function repositoryMetadataFromGitHub(repo, { languages = {}, topics = [] } = {}) {
  return {
    githubRepoId: repo.id ?? null,
    htmlUrl: repo.html_url ?? null,
    fullName: repo.full_name ?? null,
    description: repo.description ?? null,
    primaryLanguage: repo.language ?? null,
    languages,
    topics,
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    openIssuesCount: repo.open_issues_count ?? 0,
    defaultBranch: repo.default_branch ?? null,
    lastPushedAt: repo.pushed_at ?? null,
  };
}