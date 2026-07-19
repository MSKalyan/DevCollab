import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Silently refresh the access token once when we get a 401, then retry.
let isRefreshing = false;
let pendingQueue = [];

function flushQueue(error, success) {
  pendingQueue.forEach((p) => (success ? p.resolve() : p.reject(error)));
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response &&
      error.response.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url.endsWith("/auth/refresh") &&
      !originalRequest.url.endsWith("/auth/me") &&
      !originalRequest.url.endsWith("/auth/login")
    ) {
      originalRequest._retry = true;
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch(() => Promise.reject(error));
      }
      isRefreshing = true;
      try {
        await api.post("/auth/refresh");
        flushQueue(null, true);
        return api(originalRequest);
      } catch (refreshErr) {
        flushQueue(refreshErr, false);
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
