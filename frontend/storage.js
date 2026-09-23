// Ce que le téléphone garde entre deux visites : pseudo, place à chaque table, et pour
// l'hôte la partie entière (elle vit dans son téléphone). Tout peut manquer (navigation
// privée, stockage bloqué) : chaque accès est protégé et le jeu marche sans.

function safe(fn, fallback = null) {
  try { return fn(); } catch (_) { return fallback; }
}

const get = (k) => safe(() => localStorage.getItem(k));
const set = (k, v) => safe(() => localStorage.setItem(k, v));
const del = (k) => safe(() => localStorage.removeItem(k));

function readJson(k) {
  const raw = get(k);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

export const storage = {
  getName: () => get('belote:name') || '',
  setName: (name) => set('belote:name', name),

  getToken: (code) => get(`belote:seat:${code.toUpperCase()}`),
  setToken: (code, token) => { set(`belote:seat:${code.toUpperCase()}`, token); set('belote:last', code.toUpperCase()); },
  clearToken: (code) => del(`belote:seat:${code.toUpperCase()}`),

  loadHost: (code) => readJson(`belote:host:${code.toUpperCase()}`),
  saveHost: (game) => { set(`belote:host:${game.code}`, JSON.stringify(game)); set('belote:last', game.code); },
  dropHost: (code) => { del(`belote:host:${code.toUpperCase()}`); if (get('belote:last') === code) del('belote:last'); },

  // Dernière table où ce téléphone est assis (pour « Revenir à la table » sur l'accueil).
  lastTable() {
    const code = get('belote:last');
    if (!code) return null;
    return (readJson(`belote:host:${code}`) || get(`belote:seat:${code}`)) ? code : null;
  },

  loadLocal: () => readJson('belote:local'),
  saveLocal: (game) => set('belote:local', JSON.stringify(game)),
  dropLocal: () => del('belote:local'),
};
