import {
  createProject, getProjectById, getProjectTags, getAllProjects,
  getMyProjects as getMyProjectsFromModel, updateProject, deleteProject as deleteProjectFromModel,
  toggleStar, getStarCount, isStarredByUser, forkProject, getForkCount,
  requestCollab, getCollabRequests, updateCollabStatus, getAllTags
} from '../models/projectModel.js';
import { sendError, sendServerError } from '../utils/response.js';

function isAdmin(req) {
  return req.user && req.user.role === 'admin';
}

export const postCreateProject = async (req, res) => {
  const { title, description, category, github_url, live_url, status, tags } = req.body;
  const ownerId = req.user.id;
  const image = req.file ? req.file.location : null;

  try {
    const tagsArray = tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : tags) : [];
    const project = await createProject(title, description, ownerId, category, image, github_url, live_url, status, tagsArray);
    res.status(201).json({ success: true, message: 'Project created successfully', data: project });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const getProjectList = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 12, 1), 50);
    const { tag, status, search, category, author } = req.query;

    const { projects, total } = await getAllProjects(page, limit, tag, status, search, category, author);

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      projects,
    });
  } catch (error) {
    console.error('getProjectList error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const viewProject = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const project = await getProjectById(id);
    if (!project) return sendError(res, 404, 'Project not found');

    const tags = await getProjectTags(id);
    const starCount = await getStarCount(id);
    const forkCount = await getForkCount(id);
    const starred = await isStarredByUser(id, userId);

    res.json({
      success: true,
      data: { project, tags, starCount, forkCount, starred }
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const getMyProjects = async (req, res) => {
  try {
    const projects = await getMyProjectsFromModel(req.user.id);
    res.json({ success: true, data: projects });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const postEditProject = async (req, res) => {
  const { id } = req.params;
  const { title, description, category, github_url, live_url, status, tags } = req.body;
  const image = req.file ? req.file.location : null;

  try {
    const project = await getProjectById(id);
    if (!project) return sendError(res, 404, 'Project not found');
    if (project.owner_id !== req.user.id && !isAdmin(req)) {
      return sendError(res, 403, 'You can only edit your own projects');
    }

    const tagsArray = tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : tags) : [];
    const updated = await updateProject(id, title, description, category, image, github_url, live_url, status, tagsArray);
    res.json({ success: true, data: updated });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const handleDeleteProject = async (req, res) => {
  const { id } = req.params;

  try {
    const project = await getProjectById(id);
    if (!project) return sendError(res, 404, 'Project not found');
    if (project.owner_id !== req.user.id && !isAdmin(req)) {
      return sendError(res, 403, 'You can only delete your own projects');
    }

    await deleteProjectFromModel(id);
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const handleStar = async (req, res) => {
  const { id: projectId } = req.params;
  const userId = req.user.id;

  try {
    const project = await getProjectById(projectId);
    if (!project) return sendError(res, 404, 'Project not found');

    const result = await toggleStar(projectId, userId);
    const starCount = await getStarCount(projectId);
    res.json({ success: true, starred: result.starred, starCount });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const handleFork = async (req, res) => {
  const { id: projectId } = req.params;
  const userId = req.user.id;

  try {
    const project = await getProjectById(projectId);
    if (!project) return sendError(res, 404, 'Project not found');

    const forked = await forkProject(projectId, userId);
    if (!forked) return sendError(res, 500, 'Failed to fork project');

    res.json({ success: true, message: 'Project forked successfully', data: forked });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const handleRequestCollab = async (req, res) => {
  const { id: projectId } = req.params;
  const requesterId = req.user.id;
  const { message } = req.body;

  try {
    const project = await getProjectById(projectId);
    if (!project) return sendError(res, 404, 'Project not found');
    if (project.owner_id === requesterId) return sendError(res, 400, 'Cannot request collaboration on your own project');

    const request = await requestCollab(projectId, requesterId, message);
    res.status(201).json({ success: true, data: request });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const handleGetCollabRequests = async (req, res) => {
  const { id: projectId } = req.params;

  try {
    const project = await getProjectById(projectId);
    if (!project) return sendError(res, 404, 'Project not found');
    if (project.owner_id !== req.user.id && !isAdmin(req)) {
      return sendError(res, 403, 'Only project owner can view collaboration requests');
    }

    const requests = await getCollabRequests(projectId);
    res.json({ success: true, data: requests });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const handleUpdateCollabStatus = async (req, res) => {
  const { id: projectId, requestId } = req.params;
  const { status } = req.body;

  if (!['accepted', 'rejected'].includes(status)) {
    return sendError(res, 400, 'Status must be accepted or rejected');
  }

  try {
    const project = await getProjectById(projectId);
    if (!project) return sendError(res, 404, 'Project not found');
    if (project.owner_id !== req.user.id && !isAdmin(req)) {
      return sendError(res, 403, 'Only project owner can update collaboration requests');
    }

    const updated = await updateCollabStatus(requestId, projectId, status);
    if (!updated) return sendError(res, 404, 'Request not found');

    res.json({ success: true, data: updated });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const handleGetTags = async (req, res) => {
  try {
    const tags = await getAllTags();
    res.json({ success: true, data: tags });
  } catch (err) {
    return sendServerError(res, err);
  }
};
