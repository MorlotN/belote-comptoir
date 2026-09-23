// Accès REST au backend. Les actions de jeu passent toutes par `act` ; l'état revient
// dans la réponse et arrive aussi par WebSocket (ws.js) chez tous les joueurs.

export class ApiError extends Error {
  constructor(detail, status) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
  }
}

function safeStorage(fn, fallback = null) {
  try { return fn(); } catch (_) { return fallback; }
}

export const storage = {
  tokenKey: (code) => `belote:${code.toUpperCase()}`,
  getToken(code) { return safeStorage(() => localStorage.getItem(storage.tokenKey(code))); },
  setToken(code, token) { safeStorage(() => localStorage.setItem(storage.tokenKey(code), token)); },
  clearToken(code) { safeStorage(() => localStorage.removeItem(storage.tokenKey(code))); },
  getName() { return safeStorage(() => localStorage.getItem('belote:name'), '') || ''; },
  setName(name) { safeStorage(() => localStorage.setItem('belote:name', name)); },
};

async function request(method, path, { body, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['X-Player-Token'] = token;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (_) {
    throw new ApiError('Pas de réseau, réessaie dans un instant.', 0);
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = null; }
  }
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    if (data && typeof data.detail === 'string') detail = data.detail;
    else if (data && Array.isArray(data.detail)) detail = 'Saisie invalide';
    throw new ApiError(detail, res.status);
  }
  return data;
}

const game = (code) => `/api/games/${encodeURIComponent(code.toUpperCase())}`;

export const api = {
  create(name) { return request('POST', '/api/games', { body: { name } }); },
  join(code, name) { return request('POST', `${game(code)}/join`, { body: { name } }); },
  state(code, token) { return request('GET', game(code), { token }); },
  act(code, token, body) { return request('POST', `${game(code)}/action`, { token, body }); },
};
