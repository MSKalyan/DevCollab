import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, Search, Star, GitFork, Github, ExternalLink, Sparkles, ArrowRight } from "lucide-react";
import api from "../api/api";
import PageShell from "../components/ui/PageShell";
import Button from "../components/ui/Button";
import SectionHeader from "../components/ui/SectionHeader";
import EmptyState from "../components/ui/EmptyState";
import { Card, Badge } from "../components/ui/Card";
import { SkeletonCard } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

function openInNewTab(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function RepoCard({ project }) {
  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-ink">
          <button
            onClick={() => openInNewTab(project.htmlUrl)}
            className="hover:text-merge hover:underline"
            title={project.fullName}
          >
            {project.fullName}
          </button>
        </h3>
        {project.language && <Badge variant="neutral">{project.language}</Badge>}
      </div>

      {project.description && (
        <p className="line-clamp-2 text-sm text-ink-soft">{project.description}</p>
      )}

      {project.topics?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {project.topics.slice(0, 5).map((topic) => (
            <span
              key={topic}
              className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[0.6875rem] text-ink-muted"
            >
              {topic}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center gap-4 font-mono text-[0.6875rem] uppercase tracking-wider text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5" /> {project.stars}
        </span>
        <span className="inline-flex items-center gap-1">
          <GitFork className="h-3.5 w-3.5" /> {project.forks}
        </span>
        <span className="inline-flex items-center gap-1">
          <Github className="h-3.5 w-3.5" /> {project.openIssuesCount} open
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => openInNewTab(project.htmlUrl)}>
          <ExternalLink className="h-3.5 w-3.5" /> View repo
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={project.openIssuesCount === 0}
          onClick={() => openInNewTab(`${project.htmlUrl}/issues`)}
        >
          <Github className="h-3.5 w-3.5" /> Open issues
        </Button>
      </div>
    </Card>
  );
}

function IssueCard({ rec }) {
  return (
    <a
      href={rec.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="surface surface-hover block p-5 transition"
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant="brand">{rec.repository}</Badge>
        <span className="font-mono text-xs text-merge">#{rec.number}</span>
      </div>
      <p className="mt-3 font-medium text-ink hover:text-merge">{rec.title}</p>

      {rec.labels?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {rec.labels.slice(0, 4).map((label) => (
            <span
              key={label}
              className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[0.6875rem] text-ink-muted"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.6875rem] uppercase tracking-wider text-ink-muted">
            Matches your skills
          </p>
          <p className="truncate font-mono text-[0.6875rem] text-merge">
            {rec.matched_skills?.length ? rec.matched_skills.join(", ") : "general fit"}
          </p>
        </div>
        <span className="shrink-0 font-mono text-sm font-semibold text-merge">
          {Math.round(rec.fit_score)}% fit
        </span>
      </div>
    </a>
  );
}

export default function ExploreProjects() {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("all");
  const [recommendations, setRecommendations] = useState([]);
  const [suggestionsState, setSuggestionsState] = useState("loading"); // loading | connected | not_connected | no_evidence | none | error
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/explore/projects");
        setProjects(res.data.data?.projects || []);
        setLanguages(res.data.data?.languages || []);
      } catch {
        toast.error("Unable to load projects.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [toast]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/recommendations?limit=6");
        const data = res.data;
        if (!data.connected) {
          setSuggestionsState("not_connected");
        } else if (data.recommendations?.length) {
          setRecommendations(data.recommendations);
          setSuggestionsState("connected");
        } else if (data.reason === "NO_EVIDENCE" || (data.backfill_status && data.backfill_status !== "COMPLETED")) {
          setSuggestionsState("no_evidence");
        } else {
          setSuggestionsState("none");
        }
      } catch {
        setSuggestionsState("error");
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (language !== "all" && p.language !== language) return false;
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    });
  }, [projects, search, language]);

  if (loading) {
    return (
      <PageShell
        eyebrow="discover"
        title="Open Source Projects"
        subtitle="Find open-source projects worth contributing to and get matched with issues that fit your skills."
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="discover"
      title="Open Source Projects"
      subtitle="Find open-source projects worth contributing to and get matched with issues that fit your skills."
    >
      <section className="mb-10">
        <div className="flex items-baseline gap-4">
          <SectionHeader className="flex-1" count={recommendations.length || undefined}>
            Suggested for you
          </SectionHeader>
          <Link
            to="/contributions"
            className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-wider text-merge hover:underline"
          >
            See full analysis <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {suggestionsState === "loading" ? (
          <p className="text-sm text-ink-muted">Matching issues to your skills…</p>
        ) : suggestionsState === "connected" ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((rec) => (
              <IssueCard key={rec.issue_id} rec={rec} />
            ))}
          </div>
        ) : suggestionsState === "not_connected" ? (
          <EmptyState
            icon={Github}
            title="Connect GitHub for personalized suggestions"
            description="Once connected, we match open issues from these projects to the skills you've demonstrated through real contributions."
            action={
              <Link to="/github">
                <Button variant="secondary">Connect GitHub</Button>
              </Link>
            }
          />
        ) : suggestionsState === "no_evidence" ? (
          <EmptyState
            icon={Sparkles}
            title="Suggestions unlock once you have contribution history"
            description="Sync your GitHub evidence and we'll start recommending issues that fit your demonstrated skills."
            action={
              <Link to="/github">
                <Button variant="secondary">View GitHub Evidence</Button>
              </Link>
            }
          />
        ) : suggestionsState === "none" ? (
          <p className="text-sm text-ink-muted">
            No matching issues right now. Check the project list below and explore manually.
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Suggestions are unavailable at the moment.</p>
        )}
      </section>

      <section>
        <SectionHeader count={filtered.length}>Explore projects</SectionHeader>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              className="field pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or description…"
              aria-label="Search projects"
            />
          </div>
          <select
            className="field sm:w-56"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            aria-label="Filter by language"
          >
            <option value="all">All languages</option>
            {languages.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="No projects match"
            description="Try a different search term or language."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <RepoCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}