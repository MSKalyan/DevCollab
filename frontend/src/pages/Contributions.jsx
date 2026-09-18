import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Brain,
  Compass,
  ExternalLink,
  FolderGit2,
  GitCommitHorizontal,
  GitPullRequest,
  Github,
  Lightbulb,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";
import api from "../api/api";
import useAuth from "../hooks/useAuth";
import PageShell from "../components/ui/PageShell";
import Button from "../components/ui/Button";
import SectionHeader from "../components/ui/SectionHeader";
import EmptyState from "../components/ui/EmptyState";
import { Card, Badge } from "../components/ui/Card";
import StatCard from "../components/ui/StatCard";
import StatStrip from "../components/ui/StatStrip";
import SkillBar from "../components/ui/SkillBar";
import { SkeletonCard } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

const LEVEL_VARIANTS = {
  newcomer: "neutral",
  intermediate: "brand",
  advanced: "success",
  expert: "warning",
};

const DIFFICULTY_VARIANTS = {
  starter: "success",
  moderate: "brand",
  involved: "warning",
  deep: "danger",
};

const label = "font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted";

const pct = (value) => Math.max(0, Math.min(100, Math.round((Number(value) || 0) * 100)));

const humanize = (key) => key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

function CapabilityCard({ profile }) {
  const capability = profile.capability || {};
  const dimensions = Object.entries(capability.dimensions || {});
  const languages = capability.primaryLanguages || [];
  const skills = capability.skills || [];
  const domains = capability.domains || [];
  const level = capability.level || "unknown";

  return (
    <Card className="mb-6">
      <SectionHeader>Capability profile</SectionHeader>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-merge/10 text-merge">
            <Brain className="h-5 w-5" />
          </span>
          <div>
            <p className={label}>Level</p>
            <p className="flex items-center gap-2">
              <span className="text-lg font-semibold capitalize text-ink">{level}</span>
              {typeof capability.score === "number" && (
                <Badge variant={LEVEL_VARIANTS[level] || "neutral"}>
                  {pct(capability.score)}% score
                </Badge>
              )}
            </p>
          </div>
        </div>
        {typeof capability.confidence === "number" && (
          <div className="w-full sm:w-64">
            <SkillBar skill="confidence" percent={pct(capability.confidence)} />
          </div>
        )}
      </div>

      {dimensions.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dimensions.map(([key, value]) => (
            <SkillBar key={key} skill={humanize(key)} percent={pct(value)} />
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 border-t border-line pt-5 lg:grid-cols-2">
        <div>
          <p className={`${label} mb-3`}>Primary languages</p>
          {languages.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {languages.map((language) => (
                <Badge key={language.name} variant="neutral">
                  {language.name}
                  {typeof language.share === "number" && (
                    <span className="text-merge">{pct(language.share)}%</span>
                  )}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No language signal recorded yet.</p>
          )}

          {domains.length > 0 && (
            <>
              <p className={`${label} mb-3 mt-5`}>Domains</p>
              <div className="flex flex-wrap gap-2">
                {domains.map((domain) => (
                  <Badge key={domain} variant="brand">
                    {domain}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <p className={`${label} mb-3`}>Demonstrated skills</p>
          {skills.length > 0 ? (
            <div className="space-y-4">
              {skills.slice(0, 10).map((s) => (
                <div key={s.skill}>
                  <SkillBar skill={s.skill} percent={pct(s.score)} />
                  <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-wider text-ink-muted">
                    {[
                      s.strength,
                      typeof s.merged_pr_count === "number" && `${s.merged_pr_count} merged PRs`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No skills computed yet.</p>
          )}
        </div>
      </div>

      {profile.narrative && (
        <p className="mt-6 border-t border-line pt-5 text-sm text-ink-soft">{profile.narrative}</p>
      )}
      {profile.generated_by && (
        <p className={`${label} mt-2`}>Narrative: {profile.generated_by}</p>
      )}
    </Card>
  );
}

function WorkingStyleCard({ workingStyle }) {
  const traits = workingStyle.traits || [];

  return (
    <Card className="mb-6">
      <SectionHeader>Working style</SectionHeader>

      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold text-ink">
          {workingStyle.label || workingStyle.archetype || "Unclassified"}
        </h3>
        {workingStyle.archetype && <Badge variant="brand">{workingStyle.archetype}</Badge>}
      </div>

      {workingStyle.summary && (
        <p className="mt-2 max-w-3xl text-sm text-ink-soft">{workingStyle.summary}</p>
      )}

      {(workingStyle.preferredScope || workingStyle.cadence) && (
        <StatStrip
          className="mt-4"
          stats={[
            workingStyle.preferredScope && {
              label: "preferred scope",
              value: workingStyle.preferredScope,
            },
            workingStyle.cadence && { label: "cadence", value: workingStyle.cadence },
          ].filter(Boolean)}
        />
      )}

      {traits.length > 0 && (
        <div className="mt-5 space-y-4">
          {traits.map((t) => (
            <div key={t.trait}>
              <SkillBar skill={t.trait} percent={pct(t.score)} />
              {t.evidence && <p className="mt-1 text-xs text-ink-muted">{t.evidence}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ExperienceCard({ experience }) {
  return (
    <Card className="mb-6">
      <SectionHeader>Experience</SectionHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={GitPullRequest} label="Merged PRs" value={experience.merged_prs || 0} />
        <StatCard icon={MessageSquareText} label="Reviews" value={experience.reviews || 0} />
        <StatCard icon={FolderGit2} label="Repositories" value={experience.repositories || 0} />
        <StatCard icon={GitCommitHorizontal} label="Commits" value={experience.commits || 0} />
      </div>

      <StatStrip
        className="mt-4"
        stats={[
          { label: "active days", value: experience.active_days || 0 },
          { label: "span days", value: experience.span_days || 0 },
          { label: "avg pr size", value: experience.avg_pr_size || 0 },
        ]}
      />
    </Card>
  );
}

// What kind of work maintainers have actually merged from this person, learned
// from the labels on their merged PRs — the evidence behind the work-type filter.
function WorkTypeCard({ labels, onSelect, selected }) {
  const workTypes = labels?.workTypes || [];

  return (
    <Card className="flex flex-col gap-4">
      <SectionHeader>Demonstrated work types</SectionHeader>
      {workTypes.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No labelled merged pull requests yet, so we&apos;ll point you at
          newcomer-friendly work instead.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-soft">
            Learned from the labels maintainers applied to your merged pull requests.
          </p>
          <ul className="space-y-2">
            {workTypes.slice(0, 6).map((w) => (
              <li key={w.workType} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm text-ink">{w.label}</span>
                <span className="shrink-0 font-mono text-[0.6875rem] text-ink-muted">
                  {w.merged_pr_count} {w.merged_pr_count === 1 ? "PR" : "PRs"}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onSelect("")}
              className={`rounded-md px-2 py-1 font-mono text-[0.6875rem] transition ${
                selected === ""
                  ? "bg-merge/15 text-merge"
                  : "bg-surface-2 text-ink-muted hover:text-ink"
              }`}
            >
              all work
            </button>
            {workTypes.slice(0, 6).map((w) => (
              <button
                key={w.workType}
                type="button"
                onClick={() => onSelect(w.workType)}
                className={`rounded-md px-2 py-1 font-mono text-[0.6875rem] transition ${
                  selected === w.workType
                    ? "bg-merge/15 text-merge"
                    : "bg-surface-2 text-ink-muted hover:text-ink"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function RecommendationCard({ rec }) {
  const difficulty = rec.difficulty || "moderate";

  return (
    <Card hover className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={label}>Rank {rec.rank}</span>
            {rec.repository && <Badge variant="brand">{rec.repository}</Badge>}
          </div>
          <a
            href={rec.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block font-medium text-ink hover:text-merge hover:underline"
          >
            {rec.title}
          </a>
        </div>
        <span className="shrink-0 font-mono text-sm font-semibold text-merge">
          {typeof rec.fit_score === "number" ? `${Math.round(rec.fit_score)}% fit` : "unscored"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {rec.work_type_label && (
          <Badge variant="brand">{rec.work_type_label}</Badge>
        )}
        <Badge variant={DIFFICULTY_VARIANTS[difficulty] || "neutral"}>{difficulty}</Badge>
        {rec.scope && <Badge variant="neutral">{rec.scope} scope</Badge>}
        {rec.repo_language && <Badge variant="neutral">{rec.repo_language}</Badge>}
        {typeof rec.repo_stars === "number" && (
          <span className="inline-flex items-center gap-1 font-mono text-[0.6875rem] text-ink-muted">
            <Star className="h-3.5 w-3.5" /> {rec.repo_stars.toLocaleString()}
          </span>
        )}
        {typeof rec.number === "number" && (
          <span className="font-mono text-[0.6875rem] text-ink-muted">#{rec.number}</span>
        )}
      </div>

      {rec.labels?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rec.labels.slice(0, 4).map((l) => (
            <span
              key={l}
              className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[0.6875rem] text-ink-muted"
            >
              {l}
            </span>
          ))}
        </div>
      )}

      {rec.why?.length > 0 && (
        <ul className="space-y-1.5 text-sm text-ink-soft">
          {rec.why.map((reason, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-merge" aria-hidden="true" />
              {reason}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto space-y-3">
        <div className="border-t border-line pt-3">
          <p className={label}>Matched skills</p>
          <p className="truncate font-mono text-[0.6875rem] text-merge">
            {rec.matched_skills?.length ? rec.matched_skills.join(", ") : "general fit"}
          </p>
        </div>

        {rec.next_step && (
          <div className="flex items-start gap-2 rounded-lg bg-surface-2 p-3">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-merge" />
            <div>
              <p className={label}>Next step</p>
              <p className="text-sm text-ink-soft">{rec.next_step}</p>
            </div>
          </div>
        )}

        <a
          href={rec.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-merge hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open issue
        </a>
      </div>
    </Card>
  );
}

export default function Contributions() {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Filtering by work type re-runs the agent server-side, because the filter
  // changes which issues enter the ranking pool rather than just the page slice.
  const [workType, setWorkType] = useState("");

  const load = useCallback(async (selectedWorkType = "") => {
    setLoading(true);
    try {
      const query = selectedWorkType ? `?work_type=${encodeURIComponent(selectedWorkType)}` : "";
      const res = await api.get(`/contributions${query}`);
      setData(res.data);
      setError("");
    } catch (err) {
      const message =
        err?.response?.status === 401
          ? "Your session expired. Please log in again."
          : err?.response?.data?.message || "Unable to load your contribution analysis.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const selectWorkType = (next) => {
    setWorkType(next);
    load(next);
  };

  useEffect(() => {
    if (authLoading) return;
    if (isLoggedIn) {
      load();
    } else {
      setLoading(false);
    }
  }, [authLoading, isLoggedIn, load]);

  if (authLoading || loading) {
    return (
      <PageShell
        eyebrow="analysis"
        title="Contribution Analysis"
        subtitle="How your GitHub evidence translates into capability, working style, and issues you can realistically land."
      >
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </PageShell>
    );
  }

  if (!isLoggedIn) {
    return (
      <PageShell
        eyebrow="analysis"
        title="Contribution Analysis"
        subtitle="How your GitHub evidence translates into capability, working style, and issues you can realistically land."
      >
        <EmptyState
          icon={Github}
          title="Log in to see your analysis"
          description="Your capability profile is derived from your own GitHub evidence, so we need a session to load it."
          action={
            <Link to="/login">
              <Button variant="secondary">Log in</Button>
            </Link>
          }
        />
      </PageShell>
    );
  }

  const connected = data?.connected === true;
  const profile = data?.profile;
  const recommendations = data?.recommendations || [];
  const noEvidence = data?.reason === "no_evidence";
  const backfillRunning = ["QUEUED", "RUNNING"].includes(data?.backfill_status);

  return (
    <PageShell
      eyebrow="analysis"
      title="Contribution Analysis"
      subtitle="How your GitHub evidence translates into capability, working style, and issues you can realistically land."
    >
      {error && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4 font-mono text-sm text-danger">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </span>
          <Button variant="dangerOutline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </Button>
        </div>
      )}

      {!connected ? (
        error ? null : (
          <EmptyState
            icon={Github}
            title="Connect GitHub to build your profile"
            description="The agent reads your merged pull requests, reviews, and contributed repositories to infer what you can realistically take on."
            action={
              <Link to="/github">
                <Button variant="secondary">Connect GitHub</Button>
              </Link>
            }
          />
        )
      ) : (
        <>
          {noEvidence && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>
                  {backfillRunning
                    ? "Your GitHub history is still being imported — the analysis below fills in as the backfill completes."
                    : "No contribution evidence yet. Once you have merged pull requests, reviews, or contributed repositories, the agent builds your profile from them."}
                </p>
                <Link
                  to="/github"
                  className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider hover:underline"
                >
                  <Github className="h-3.5 w-3.5" /> View GitHub evidence
                </Link>
              </div>
            </div>
          )}

          {profile && <CapabilityCard profile={profile} />}
          {profile?.workingStyle && <WorkingStyleCard workingStyle={profile.workingStyle} />}
          {profile?.experience && <ExperienceCard experience={profile.experience} />}
          {profile?.labels && (
            <WorkTypeCard
              labels={profile.labels}
              selected={workType}
              onSelect={selectWorkType}
            />
          )}

          {!noEvidence && (
            <section>
              <div className="flex items-baseline gap-4">
                <SectionHeader className="flex-1" count={recommendations.length}>
                  Recommended issues
                </SectionHeader>
                {typeof data?.total === "number" && (
                  <p className="shrink-0 font-mono text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                    {data.total} matched
                  </p>
                )}
              </div>

              {recommendations.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {recommendations.map((rec) => (
                    <RecommendationCard key={rec.issue_id ?? rec.html_url} rec={rec} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Compass}
                  title="No issues matched this time"
                  description={
                    workType
                      ? "No open issues carry that work-type label right now. Try another work type, or clear the filter to see everything."
                      : "Nothing in the current issue corpus fits your demonstrated skills, scope, and difficulty. New matches appear as the corpus syncs — or browse the projects and pick something manually."
                  }
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="secondary" onClick={() => load(workType)}>
                        <RefreshCw className="h-4 w-4" /> Refresh analysis
                      </Button>
                      <Link to="/projects">
                        <Button variant="ghost">Browse projects</Button>
                      </Link>
                    </div>
                  }
                />
              )}
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}
