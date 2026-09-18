import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Github, Compass, RefreshCw } from "lucide-react";
import api from "../api/api";
import PageShell from "../components/ui/PageShell";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import SectionHeader from "../components/ui/SectionHeader";
import RepositoryList from "../components/ui/RepositoryList";
import { FullPageLoader } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

export default function MyProjects() {
  const [repositories, setRepositories] = useState([]);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const loadContributions = async () => {
    setLoading(true);
    try {
      const res = await api.get("/github/evidence");
      setConnected(res.data.connected !== false);
      setRepositories(res.data.repositories || []);
    } catch {
      toast.error("Unable to load your contributions.");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadContributions(); }, []);

  if (loading) return <FullPageLoader label="Loading your contributions…" />;

  return (
    <PageShell
      eyebrow="contribution history"
      title="My Projects"
      subtitle="The open-source projects you've contributed to — straight from your GitHub evidence."
      actions={
        <Button variant="secondary" onClick={loadContributions}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      }
    >
      {!connected ? (
        <EmptyState
          icon={Github}
          title="Connect GitHub to see your contributions"
          description="Connect your GitHub account and DevCollab will track the projects you've contributed to via merged PRs and reviews."
          action={
            <Link to="/github">
              <Button>Connect GitHub</Button>
            </Link>
          }
        />
      ) : repositories.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="No contributions yet"
          description="You haven't contributed to any tracked projects yet. Explore open-source projects and make your first PR — it will show up here."
          action={
            <Link to="/projects">
              <Button>Explore projects to contribute</Button>
            </Link>
          }
        />
      ) : (
        <>
          <SectionHeader count={repositories.length}>Projects I've contributed to</SectionHeader>
          <div className="surface p-6">
            <RepositoryList
              repositories={repositories}
              emptyMessage="No contributions found."
            />
          </div>
        </>
      )}
    </PageShell>
  );
}