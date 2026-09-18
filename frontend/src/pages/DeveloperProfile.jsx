import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Github, GitPullRequest, FolderGit2, MessageSquareText, Globe, Mail, MapPin } from "lucide-react";
import api from "../api/api";
import Button from "../components/ui/Button";
import PageShell from "../components/ui/PageShell";
import Avatar from "../components/ui/Avatar";
import SectionHeader from "../components/ui/SectionHeader";
import StatCard from "../components/ui/StatCard";
import SkillBar from "../components/ui/SkillBar";
import RepositoryList from "../components/ui/RepositoryList";
import { FullPageLoader } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";
import useAuth from "../hooks/useAuth";

export default function DeveloperProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get(`/auth/developers/${id}`)
      .then((res) => {
        setData(res.data.data);
      })
      .catch(() => { toast.error("Developer not found."); navigate("/developers"); })
      .finally(() => setLoading(false));
  }, [id, navigate, toast]);

  if (loading) return <FullPageLoader label="Loading developer profile…" />;
  if (!data) return null;

  const { developer, github } = data;
  const isSelf = Number(id) === user?.id;
  const githubUsername = github?.username || developer.github_username;

  const sendContact = async () => {
    setSending(true);
    try {
      await api.post(`/auth/developers/${id}/contact`);
      toast.success("Contact request sent. They can accept to start chatting.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to send request.");
    } finally {
      setSending(false);
    }
  };

  return (
    <PageShell className="mx-auto max-w-5xl">
      <Button variant="ghost" size="sm" className="mb-6 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> Back to developers
      </Button>

      <section className="surface mb-8 p-6">
        <div className="flex flex-col justify-between gap-5 sm:flex-row">
          <div className="flex gap-4">
            {github?.avatar_url ? (
              <img
                src={github.avatar_url}
                alt={developer.name}
                className="h-16 w-16 rounded-full ring-1 ring-line"
              />
            ) : (
              <Avatar name={developer.name} className="h-16 w-16 text-2xl" />
            )}
            <div>
              <h1 className="display text-[length:var(--step-3)]">{developer.name}</h1>
              {developer.bio && <p className="mt-2 max-w-2xl text-ink-soft">{developer.bio}</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-ink-muted">
                {developer.location && (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{developer.location}</span>
                )}
                {githubUsername && (
                  <a href={`https://github.com/${githubUsername}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-merge">
                    <Github className="h-4 w-4" />@{githubUsername}
                  </a>
                )}
                {developer.website && (
                  <a href={developer.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-merge">
                    <Globe className="h-4 w-4" />Website
                  </a>
                )}
              </div>
            </div>
          </div>

          {!isSelf && (
            <div className="flex h-fit flex-wrap gap-2">
              <Button variant="secondary" onClick={sendContact} loading={sending}>
                <Mail className="h-4 w-4" /> Ask for contact
              </Button>
            </div>
          )}
        </div>
      </section>

      {github && (
        <>
          <section className="mb-8">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard icon={GitPullRequest} label="Merged PRs" value={github.statistics?.merged_prs || 0} />
              <StatCard icon={FolderGit2} label="Repositories" value={github.statistics?.repositories || 0} />
              <StatCard icon={MessageSquareText} label="Reviews" value={github.statistics?.reviews || 0} />
            </div>
            {github.last_synced_at && (
              <p className="mt-3 font-mono text-xs uppercase tracking-widest text-ink-muted">
                GitHub synced: {new Date(github.last_synced_at).toLocaleString()}
              </p>
            )}
          </section>

          <section className="mb-8">
            <SectionHeader count={github.skills?.length}>Demonstrated experience</SectionHeader>
            <div className="surface p-6">
              {github.skills?.length > 0 ? (
                <div className="space-y-4">
                  {github.skills.slice(0, 10).map((s) => (
                    <SkillBar key={s.skill} skill={s.skill} percent={s.score * 100} />
                  ))}
                  <p className="pt-2 text-xs text-ink-muted">
                    Skills derived from {developer.name}'s GitHub contribution history — merged PRs,
                    repositories, and reviews.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  No skills computed yet — the backfill may still be running.
                </p>
              )}
            </div>
          </section>

          <section className="mb-8">
            <SectionHeader count={github.repositories?.length}>Contributed repositories</SectionHeader>
            <div className="surface p-6">
              <RepositoryList
                repositories={github.repositories}
                emptyMessage="No repositories recorded yet — the backfill may still be running."
              />
            </div>
          </section>
        </>
      )}
    </PageShell>
  );
}
