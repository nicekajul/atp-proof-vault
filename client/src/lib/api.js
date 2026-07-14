import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('pv_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pv_token');
      localStorage.removeItem('pv_role');
    }
    return Promise.reject(err);
  }
);

export function setSession(token, role) {
  localStorage.setItem('pv_token', token);
  localStorage.setItem('pv_role', role);
  // Also set as a cookie so plain <img>/<video>/<audio> tags (which can't
  // attach an Authorization header) can authenticate against /api/preview.
  document.cookie = `token=${token}; path=/; SameSite=Lax`;
}

export function clearSession() {
  localStorage.removeItem('pv_token');
  localStorage.removeItem('pv_role');
  document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

export function getRole() {
  return localStorage.getItem('pv_role');
}

/** Decodes the `sub` claim (email, for team sessions) out of the stored JWT — no extra request needed. */
export function getEmail() {
  const token = localStorage.getItem('pv_token');
  if (!token) return null;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return payload.sub || null;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(localStorage.getItem('pv_token'));
}

export default api;
