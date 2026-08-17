import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import ProjectCard from "../components/ProjectCard";
import PageShell from "../components/ui/PageShell";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import SectionHeader from "../components/ui/SectionHeader";
import { FullPageLoader } from "../components/ui/Spinner";
import { ConfirmDialog } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import { FolderGit2, PlusSquare } from "lucide-react";

export default function MyProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const loadProjects = async () => {
    try {
      const res = await api.get("/projects/myprojects");
      setProjects(res.data.data || []);
    } catch {
      toast.error("Please log in to see your projects.");
    } finally {
      setLoading(false);
    }
  };
  // Load this user's projects when the screen opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadProjects(); }, []);

  const deleteProject = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/projects/${pendingDelete.id}`);
      setProjects((items) => items.filter((item) => item.id !== pendingDelete.id));
      toast.success("Project deleted.");
      setPendingDelete(null);
    } catch {
      toast.error("Unable to delete this project.");
    } finally { setDeleting(false); }
  };

  if (loading) return <FullPageLoader label="Loading your projects…" />;

  return (
    <PageShell
      eyebrow="workspace"
      title="My Projects"
      subtitle="Manage what you have shared with the DevCollab community."
      actions={
        <Button onClick={() => navigate("/create")}>
          <PlusSquare className="h-4 w-4" /> Share Project
        </Button>
      }
    >
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="No projects yet"
          description="Share a project to get feedback and find collaborators."
          action={
            <Button onClick={() => navigate("/create")}>
              <PlusSquare className="h-4 w-4" /> Share Project
            </Button>
          }
        />
      ) : (
        <>
          <SectionHeader count={projects.length}>Shared projects</SectionHeader>
          <div className="space-y-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                showActions
                onEdit={(item) => navigate(`/projects/${item.id}/edit`)}
                onDelete={setPendingDelete}
              />
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={deleteProject}
        loading={deleting}
        title="Delete this project?"
        message={pendingDelete ? `“${pendingDelete.title}” will be permanently removed.` : ""}
        confirmLabel="Delete"
      />
    </PageShell>
  );
}
