import pool from './db.js';

export const createProject = async (title, description, ownerId, category, image, githubUrl, liveUrl, status, tags) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const projectResult = await client.query(
      `INSERT INTO projects (title, description, owner_id, category, image, github_url, live_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, description, ownerId, category, image, githubUrl, liveUrl, status || 'active']
    );
    const project = projectResult.rows[0];

    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        const tagResult = await client.query(
          `INSERT INTO tech_tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [tagName.toLowerCase().trim()]
        );
        await client.query(
          `INSERT INTO project_tags (project_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [project.id, tagResult.rows[0].id]
        );
      }
    }

    await client.query('COMMIT');
    return project;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const getProjectById = async (projectId) => {
  const result = await pool.query(
    `SELECT p.*, u.name AS owner_name, u.avatar AS owner_avatar, u.github_username
     FROM projects p
     JOIN users u ON p.owner_id = u.id
     WHERE p.id = $1`,
    [projectId]
  );
  return result.rows[0];
};

export const getProjectTags = async (projectId) => {
  const result = await pool.query(
    `SELECT t.name FROM tech_tags t
     JOIN project_tags pt ON pt.tag_id = t.id
     WHERE pt.project_id = $1`,
    [projectId]
  );
  return result.rows.map(r => r.name);
};

export const getAllProjects = async (page, limit, tag, status, search, category, author) => {
  const offset = (page - 1) * limit;
  let query = `
    SELECT p.*, u.name AS owner_name, u.avatar AS owner_avatar,
      COALESCE(s.star_count, 0) AS star_count,
      COALESCE(f.fork_count, 0) AS fork_count,
      COALESCE(r.review_count, 0) AS review_count
    FROM projects p
    JOIN users u ON p.owner_id = u.id
    LEFT JOIN (SELECT project_id, COUNT(*) AS star_count FROM stars GROUP BY project_id) s ON s.project_id = p.id
    LEFT JOIN (SELECT project_id, COUNT(*) AS fork_count FROM forks GROUP BY project_id) f ON f.project_id = p.id
    LEFT JOIN (SELECT project_id, COUNT(*) AS review_count FROM reviews GROUP BY project_id) r ON r.project_id = p.id
    LEFT JOIN forks fk ON fk.project_id = p.id
  `;
  const values = [];
  let paramIndex = 1;
  const conditions = [];

  if (search) {
    conditions.push(`(
      p.title ILIKE $${paramIndex}
      OR p.description ILIKE $${paramIndex}
      OR u.name ILIKE $${paramIndex}
      OR EXISTS (
        SELECT 1 FROM project_tags pt
        JOIN tech_tags t ON t.id = pt.tag_id
        WHERE pt.project_id = p.id AND t.name ILIKE $${paramIndex}
      )
    )`);
    values.push(`%${search}%`);
    paramIndex++;
  }

  conditions.push(`fk.id IS NULL`);

  if (status) {
    conditions.push(`p.status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  if (tag) {
    conditions.push(`EXISTS (
      SELECT 1 FROM project_tags pt
      JOIN tech_tags t ON t.id = pt.tag_id
      WHERE pt.project_id = p.id AND t.name ILIKE $${paramIndex}
    )`);
    values.push(tag);
    paramIndex++;
  }
  if (category) {
    conditions.push(`p.category = $${paramIndex}`);
    values.push(category);
    paramIndex++;
  }
  if (author) {
    conditions.push(`u.name ILIKE $${paramIndex}`);
    values.push(`%${author}%`);
    paramIndex++;
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY p.created_at DESC`;

  const countQuery = `SELECT COUNT(*) FROM (${query}) AS filtered`;
  const countResult = await pool.query(countQuery, values);
  const total = parseInt(countResult.rows[0].count);

  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  values.push(limit, offset);

  const result = await pool.query(query, values);

  return { projects: result.rows, total };
};

export const getMyProjects = async (userId) => {
  const result = await pool.query(
    `SELECT p.*,
      COALESCE(s.star_count, 0) AS star_count,
      COALESCE(f.fork_count, 0) AS fork_count,
      COALESCE(r.review_count, 0) AS review_count
    FROM projects p
    LEFT JOIN (SELECT project_id, COUNT(*) AS star_count FROM stars GROUP BY project_id) s ON s.project_id = p.id
    LEFT JOIN (SELECT project_id, COUNT(*) AS fork_count FROM forks GROUP BY project_id) f ON f.project_id = p.id
    LEFT JOIN (SELECT project_id, COUNT(*) AS review_count FROM reviews GROUP BY project_id) r ON r.project_id = p.id
    WHERE p.owner_id = $1
    ORDER BY p.created_at DESC`,
    [userId]
  );
  return result.rows;
};

export const updateProject = async (id, title, description, category, image, githubUrl, liveUrl, status, tags) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let query, values;
    if (image) {
      query = `UPDATE projects SET title=$1, description=$2, category=$3, image=$4, github_url=$5, live_url=$6, status=$7, updated_at=CURRENT_TIMESTAMP WHERE id=$8 RETURNING *`;
      values = [title, description, category, image, githubUrl, liveUrl, status, id];
    } else {
      query = `UPDATE projects SET title=$1, description=$2, category=$3, github_url=$4, live_url=$5, status=$6, updated_at=CURRENT_TIMESTAMP WHERE id=$7 RETURNING *`;
      values = [title, description, category, githubUrl, liveUrl, status, id];
    }

    const result = await client.query(query, values);

    if (tags && tags.length > 0) {
      await client.query('DELETE FROM project_tags WHERE project_id = $1', [id]);
      for (const tagName of tags) {
        const tagResult = await client.query(
          `INSERT INTO tech_tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [tagName.toLowerCase().trim()]
        );
        await client.query(
          `INSERT INTO project_tags (project_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, tagResult.rows[0].id]
        );
      }
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const deleteProject = async (id) => {
  const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING *', [id]);
  return result.rows[0];
};

export const toggleStar = async (projectId, userId) => {
  const existing = await pool.query(
    'SELECT * FROM stars WHERE project_id = $1 AND user_id = $2',
    [projectId, userId]
  );

  if (existing.rows.length > 0) {
    await pool.query('DELETE FROM stars WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
    return { starred: false };
  } else {
    await pool.query('INSERT INTO stars (project_id, user_id) VALUES ($1, $2)', [projectId, userId]);
    return { starred: true };
  }
};

export const getStarCount = async (projectId) => {
  const result = await pool.query('SELECT COUNT(*) FROM stars WHERE project_id = $1', [projectId]);
  return parseInt(result.rows[0].count);
};

export const isStarredByUser = async (projectId, userId) => {
  if (!userId) return false;
  const result = await pool.query('SELECT 1 FROM stars WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
  return result.rows.length > 0;
};

export const forkProject = async (projectId, userId) => {
  const project = await getProjectById(projectId);
  if (!project) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const forkResult = await client.query(
      `INSERT INTO projects (title, description, owner_id, category, image, github_url, live_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING *`,
      [`Fork: ${project.title}`, project.description, userId, project.category, project.image, project.github_url, project.live_url]
    );

    await client.query(
      `INSERT INTO forks (project_id, user_id, forked_from_id) VALUES ($1, $2, $3)`,
      [forkResult.rows[0].id, userId, projectId]
    );

    const tags = await getProjectTags(projectId);
    for (const tagName of tags) {
      const tagResult = await client.query(
        `INSERT INTO tech_tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [tagName]
      );
      await client.query(
        `INSERT INTO project_tags (project_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [forkResult.rows[0].id, tagResult.rows[0].id]
      );
    }

    await client.query('COMMIT');
    return forkResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const getForkCount = async (projectId) => {
  const result = await pool.query('SELECT COUNT(*) FROM forks WHERE project_id = $1', [projectId]);
  return parseInt(result.rows[0].count);
};

export const requestCollab = async (projectId, requesterId, message) => {
  const result = await pool.query(
    `INSERT INTO collab_requests (project_id, requester_id, message)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, requester_id) DO UPDATE SET message = $3, status = 'pending'
     RETURNING *`,
    [projectId, requesterId, message]
  );
  return result.rows[0];
};

export const getCollabRequests = async (projectId) => {
  const result = await pool.query(
    `SELECT cr.*, u.name AS requester_name, u.avatar AS requester_avatar, u.github_username
     FROM collab_requests cr
     JOIN users u ON cr.requester_id = u.id
     WHERE cr.project_id = $1
     ORDER BY cr.created_at DESC`,
    [projectId]
  );
  return result.rows;
};

export const updateCollabStatus = async (requestId, projectId, status) => {
  const result = await pool.query(
    `UPDATE collab_requests SET status = $1 WHERE id = $2 AND project_id = $3 RETURNING *`,
    [status, requestId, projectId]
  );
  return result.rows[0];
};

export const getAllTags = async () => {
  const result = await pool.query('SELECT name FROM tech_tags ORDER BY name');
  return result.rows.map(r => r.name);
};
