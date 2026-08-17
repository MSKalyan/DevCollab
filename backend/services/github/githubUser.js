// GitHub user identity helpers. All calls go through the client so auth and
// rate-limit handling stay centralized.

export async function getAuthenticatedUser(client) {
  return client.request((octokit) => octokit.rest.users.getAuthenticated());
}

// Public profile for a login (used to confirm identity on linked accounts).
export async function getPublicUser(client, login) {
  return client.request((octokit) => octokit.rest.users.getByUsername({ username: login }));
}