import React from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "./Card";

export default function RepositoryList({
  repositories,
  emptyMessage = "No contributed repositories recorded yet.",
}) {
  if (!repositories?.length) {
    return <p className="text-sm text-ink-muted">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {repositories.map((repo) => (
        <div
          key={repo.id ?? repo.fullName}
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="min-w-0">
            <a
              href={repo.sourceUrl || `https://github.com/${repo.fullName}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-sm font-medium text-ink hover:text-merge"
            >
              {repo.fullName}
              <ExternalLink className="h-3.5 w-3.5 text-ink-muted" />
            </a>
            {repo.description && (
              <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{repo.description}</p>
            )}
            {repo.topics?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {repo.topics.slice(0, 8).map((t) => (
                  <Badge key={t} variant="brand" className="normal-case">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
            {repo.languages?.length > 0 && (
              <p className="mt-2 font-mono text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                {repo.languages.slice(0, 6).join(" · ")}
              </p>
            )}
          </div>
          {repo.language && <Badge variant="neutral">{repo.language}</Badge>}
        </div>
      ))}
    </div>
  );
}