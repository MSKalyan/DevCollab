import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/api";
import useAuth from "../hooks/useAuth";
import PageShell from "../components/ui/PageShell";
import Button from "../components/ui/Button";
import SectionHeader from "../components/ui/SectionHeader";
import { Card, Badge } from "../components/ui/Card";
import StatCard from "../components/ui/StatCard";
import SkillBar from "../components/ui/SkillBar";
import RepositoryList from "../components/ui/RepositoryList";
import { FullPageLoader, Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";
import { Github, RefreshCw, GitPullRequest, FolderGit2, MessageSquareText, AlertTriangle } from "lucide-react";

const STATUS_LABELS = {
  NOT_CONNECTED: { label: "Not connected", variant: "neutral" },
  QUEUED: { label: "Queued", variant: "warning" },
  RUNNING: { label: "Running", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "success" },
  FAILED: { label: "Failed", variant: "danger" },
};

const OAUTH_ERROR_LABELS = {
  github_account_linked_to_another_user:
    "This GitHub account is already linked to another DevCollab profile. Disconnect it from that profile first, then try again.",
  invalid_state: "The GitHub connection expired. Please try again.",
  unauthorized: "Please log in before connecting GitHub.",
  missing_code: "GitHub did not return an authorization code. Please try again.",
};

export default function GitHub() {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    const res = await api.get("/github/status");
    return res.data;
  }, []);

  const fetchEvidence = useCallback(async () => {
    const res = await api.get("/github/evidence");
    return res.data;
  }, []);

  const refreshAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [s, e] = await Promise.all([fetchStatus(), fetchEvidence()]);
      setStatus(s);
      setEvidence(e);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load GitHub status.");
    } finally {
      setLoading(false);
    }
  }, [fetchStatus, fetchEvidence]);

  // Poll while backfill is queued or running.
  useEffect(() => {
    const active = ["QUEUED", "RUNNING"].includes(status?.backfill_status);
    if (!active) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const s = await fetchStatus();
        setStatus(s);
        if (!["QUEUED", "RUNNING"].includes(s?.backfill_status)) {
          await refreshAll(true);
        }
      } catch {
        /* transient network errors are fine while polling */
      }
    }, 5000);
    return () => {
      clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [status?.backfill_status, fetchStatus, refreshAll]);

  useEffect(() => {
    if (!authLoading) refreshAll();
  }, [authLoading, refreshAll]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      toast.error(OAUTH_ERROR_LABELS[oauthError] || `GitHub connection failed: ${oauthError}`);
      window.history.replaceState({}, "", "/github");
    }
  }, [toast]);

  const connectGithub = async () => {
    try {
      const res = await api.get("/auth/github");
      window.location.href = res.data.data.url;
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not start GitHub connection.");
    }
  };

  const retryBackfill = async () => {
    try {
      await api.post("/github/backfill");
      toast.success("Backfill queued. This can take a moment.");
      await refreshAll(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not queue backfill.");
    }
  };

  const disconnectGithub = async () => {
    if (
      !window.confirm(
        "Disconnect GitHub? Your evidence, skills, and contributed repositories will be removed from this profile."
      )
    ) {
      return;
    }
    try {
      await api.delete("/github/disconnect");
      toast.success("GitHub disconnected.");
      await refreshAll(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not disconnect GitHub.");
    }
  };

  if (authLoading || loading) {
    return <FullPageLoader label="Loading GitHub…" />;
  }
  if (!isLoggedIn) {
    return <p className="text-center text-sm text-ink-muted">Please log in to connect GitHub.</p>;
  }

  const connected = status?.connected;

  return (
    <PageShell
      eyebrow="evidence"
      title="GitHub Evidence"
      subtitle="Connect GitHub so DevCollab can build your contribution profile from your real history."
    >
      {error && (
        <div className="mb-6 rounded-lg border border-danger/40 bg-danger/10 p-4 font-mono text-sm text-danger">
          {error}
        </div>
      )}

      {!connected ? (
        <Card>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-surface-2 text-ink-muted">
              <Github className="h-8 w-8" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-ink">Connect your GitHub account</h2>
              <p className="mt-1 max-w-md text-sm text-ink-muted">
                We'll use your merged pull requests, contributed repositories, and reviews
                to derive your demonstrated tech stack. Your token is encrypted at rest and
                never exposed to the browser.
              </p>
            </div>
            <Button onClick={connectGithub} size="lg">
              <Github className="h-5 w-5" /> Connect GitHub
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="mb-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {status.avatar_url && (
                  <img
                    src={status.avatar_url}
                    alt={status.github_username}
                    className="h-12 w-12 rounded-full ring-1 ring-line"
                  />
                )}
                <div>
                  <p className="font-semibold text-ink">
                    {status.name || status.github_username}
                  </p>
                  <a
                    href={`https://github.com/${status.github_username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-merge hover:underline"
                  >
                    @{status.github_username}
                  </a>
                </div>
              </div>
              <Badge variant={STATUS_LABELS[status.backfill_status]?.variant || "neutral"}>
                {STATUS_LABELS[status.backfill_status]?.label || status.backfill_status}
              </Badge>
            </div>

            {status.backfill_status === "FAILED" && status.backfill_error && (
              <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 font-mono text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Backfill failed: {status.backfill_error}</span>
              </div>
            )}

            {(status.backfill_status === "QUEUED" || status.backfill_status === "RUNNING") && (
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <Spinner className="h-4 w-4 text-merge" /> Backfilling your GitHub history…
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard icon={GitPullRequest} label="Merged PRs" value={status.statistics?.merged_prs || 0} />
              <StatCard icon={FolderGit2} label="Repositories" value={status.statistics?.repositories || 0} />
              <StatCard icon={MessageSquareText} label="Reviews" value={status.statistics?.reviews || 0} />
            </div>

            {status.last_synced_at && (
              <p className="font-mono text-xs uppercase tracking-widest text-ink-muted">
                Last synced: {new Date(status.last_synced_at).toLocaleString()}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={disconnectGithub}>
                Disconnect
              </Button>
              <Button variant="secondary" onClick={retryBackfill}>
                <RefreshCw className="h-4 w-4" /> Re-run backfill
              </Button>
            </div>
          </Card>

          <Card>
            <SectionHeader>Your demonstrated experience</SectionHeader>
            {evidence?.skills?.length > 0 ? (
              <div className="space-y-4">
                {evidence.skills.slice(0, 10).map((s) => (
                  <SkillBar key={s.skill} skill={s.skill} percent={s.score * 100} />
                ))}
                <p className="pt-2 text-xs text-ink-muted">
                  Evidence is based on your GitHub contribution history — merged PRs, repositories,
                  and reviews. Scores reflect confidence from evidence, not a self-reported claim.
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                No skills computed yet. Re-run the backfill once your connection finishes.
              </p>
            )}
          </Card>

          <Card>
            <SectionHeader count={evidence?.repositories?.length}>
              Contributed repositories
            </SectionHeader>
            <RepositoryList repositories={evidence?.repositories} />
          </Card>
        </>
      )}
    </PageShell>
  );
}
