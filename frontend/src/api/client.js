const TOKEN_KEY = 'ccp_token';
const GET_CACHE_TTL = {
  '/api/schema/users': 30_000,
  '/api/schema/entitlements': 30_000,
  '/api/dashboard/stats': 12_000,
};

const getCache = new Map();
let onUnauthorized = null;
let refreshInFlight = null;

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

function cacheKey(path) {
  return path.split('?')[0];
}

function readGetCache(path) {
  const base = cacheKey(path);
  const ttl = GET_CACHE_TTL[base];
  if (!ttl) return null;
  const hit = getCache.get(path);
  if (!hit) return null;
  if (Date.now() - hit.at > ttl) {
    getCache.delete(path);
    return null;
  }
  return hit.data;
}

function writeGetCache(path, data) {
  const base = cacheKey(path);
  if (!GET_CACHE_TTL[base]) return;
  getCache.set(path, { at: Date.now(), data });
}

export function clearApiCache() {
  getCache.clear();
}

async function tryRefreshSession() {
  if (!getToken()) return false;
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      credentials: 'include',
    })
      .then(async (res) => {
        const text = await res.text();
        let data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = null;
          }
        }
        if (!res.ok) return null;
        if (data?.token) setToken(data.token);
        return data;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  const data = await refreshInFlight;
  return Boolean(data?.token);
}

async function request(path, options = {}, { retried = false } = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method === 'GET') {
    const cached = readGetCache(path);
    if (cached) return cached;
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (res.status === 401 && !retried && path !== '/api/auth/login' && path !== '/api/auth/refresh') {
    const code = data?.code;
    if (code === 'TOKEN_EXPIRED' || code === 'TOKEN_INVALID' || code === 'NO_TOKEN') {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        return request(path, options, { retried: true });
      }
      onUnauthorized?.(data);
    }
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }

  if (method === 'GET') writeGetCache(path, data);
  if (method !== 'GET') clearApiCache();
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),
};
