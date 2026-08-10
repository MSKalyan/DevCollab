import client from '../config/redis.js';

const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_SECONDS || '60', 10);

export async function getCache(key) {
  if (!client.isReady) return null;
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Cache get error:', err.message);
    return null;
  }
}

export async function setCache(key, data, ttl = DEFAULT_TTL) {
  if (!client.isReady) return;
  try {
    await client.setEx(key, ttl, JSON.stringify(data));
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Cache set error:', err.message);
  }
}

export async function delCache(...keys) {
  if (!client.isReady || keys.length === 0) return;
  try {
    await client.del(...keys);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Cache del error:', err.message);
  }
}

export async function delCacheByPattern(pattern) {
  if (!client.isReady) return;
  try {
    const keys = [];
    for await (const batch of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      for (const key of batch) keys.push(key);
    }
    if (keys.length > 0) await client.del(...keys);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Cache pattern del error:', err.message);
  }
}

export const listCacheKey = (params) => {
  const normalized = Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
  );
  return `projects:list:${JSON.stringify(normalized)}`;
};

export const projectCacheKey = (projectId) => `project:${projectId}`;

export const reviewCacheKey = (projectId, page, limit) => `reviews:project:${projectId}:${page}:${limit}`;

export const tagsCacheKey = 'tags:all';

export const invalidateProjectLists = () => delCacheByPattern('projects:list:*');

export const invalidateProject = async (projectId) => {
  await Promise.all([
    delCache(projectCacheKey(projectId)),
    invalidateProjectLists(),
  ]);
};

export const invalidateProjectReviews = (projectId) => delCacheByPattern(`reviews:project:${projectId}:*`);

export const invalidateTagsCache = () => delCache(tagsCacheKey);

export const invalidateAllProjectsCache = async () => {
  await Promise.all([
    delCacheByPattern('project:*'),
    invalidateProjectLists(),
    delCacheByPattern('reviews:project:*'),
  ]);
};
