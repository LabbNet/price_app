const base = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'price_app_token';

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(apiUrl(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (r.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('auth:logout'));
  }

  const text = await r.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })() : null;

  if (!r.ok) {
    const err = new Error(data?.error || `${r.status} ${r.statusText}`);
    err.status = r.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const apiGet = (p) => request('GET', p);
export const apiPost = (p, b) => request('POST', p, b);
export const apiPatch = (p, b) => request('PATCH', p, b);
export const apiDelete = (p) => request('DELETE', p);

/**
 * POST a multipart/form-data payload. Pass a plain object; values that are
 * File instances are appended as-is, everything else is coerced to string.
 */
export async function apiUpload(path, fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    if (v instanceof File || v instanceof Blob) {
      form.append(k, v);
    } else {
      form.append(k, String(v));
    }
  }

  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(apiUrl(path), { method: 'POST', headers, body: form });

  if (r.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('auth:logout'));
  }

  const text = await r.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })() : null;

  if (!r.ok) {
    const err = new Error(data?.error || `${r.status} ${r.statusText}`);
    err.status = r.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export async function apiDownload(path, filename) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(apiUrl(path), { headers });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
