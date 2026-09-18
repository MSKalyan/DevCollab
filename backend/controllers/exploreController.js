import { listExploreProjects } from "../models/curatedRepositoryModel.js";
import { sendServerError } from "../utils/response.js";

// GET /api/explore/projects — discover open-source projects to contribute to.
export const exploreProjects = async (req, res) => {
  const { search, language } = req.query;
  try {
    const projects = await listExploreProjects({
      search: search || null,
      language: language || null,
    });
    const languages = [...new Set(projects.map((p) => p.primary_language).filter(Boolean))].sort();

    return res.json({
      success: true,
      data: {
        projects: projects.map((p) => ({
          id: p.id,
          fullName: p.full_name,
          owner: p.owner,
          name: p.name,
          description: p.description || null,
          language: p.primary_language || null,
          topics: p.topics,
          stars: p.stars,
          forks: p.forks,
          openIssuesCount: p.open_issues_count,
          htmlUrl: p.html_url,
          lastPushedAt: p.last_pushed_at,
        })),
        languages,
        total: projects.length,
      },
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};