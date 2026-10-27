// REST client (D1a): all server access goes through here; attaches the session token and maps the
// error-code catalogue (Section 47.5) to ApiError.
const TOKEN_KEY = 'pms.token';

export const session = { token: localStorage.getItem(TOKEN_KEY) || null, user: null, unread: 0 };

export function setToken(token) {
  session.token = token;
  if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(payload, status) {
    super(payload.message || 'Request failed.');
    this.code = payload.code || 'E-PERSIST';
    this.status = status;
    this.fields = payload.fields || [];
    this.failedRules = payload.failedRules || [];
    this.existing = payload.existing || null;
    this.payload = payload;
  }
}

export async function api(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (_) {
    throw new ApiError({ code: 'E-PERSIST', message: 'Cannot reach the PMS server. Is it running?' }, 0);
  }
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  if (!res.ok) {
    const err = new ApiError(data.error || { code: 'E-PERSIST', message: `Request failed (${res.status}).` }, res.status);
    if (err.code === 'E-UNAUTH') window.dispatchEvent(new CustomEvent('pms:unauth'));
    throw err;
  }
  return data;
}

export const get = (path) => api('GET', path);
export const post = (path, body = {}) => api('POST', path, body);
export const put = (path, body = {}) => api('PUT', path, body);

export async function download(path, filename) {
  const res = await fetch(path, { headers: session.token ? { Authorization: `Bearer ${session.token}` } : {} });
  if (!res.ok) throw new ApiError({ code: 'E-PERSIST', message: 'Export failed.' }, res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
