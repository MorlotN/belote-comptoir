import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from './html.js';
import { hostTable, joinTable } from './net.js';
import { storage } from './storage.js';
import { Brand, Toasts, navigate, toast, useWakeLock } from './ui.js';
import { Home, JoinForm } from './screens/home.js';
import { Lobby } from './screens/lobby.js';
import { LocalTable } from './screens/local.js';
import { Rules } from './screens/rules.js';
import { Table } from './screens/table.js';

// Routes : #/ , #/t/CODE (une table en réseau), #/solo (un seul téléphone), #/regles
function parseRoute() {
  const parts = (location.hash || '#/').slice(1).split('/').filter(Boolean);
  if (parts[0] === 't' && parts[1]) return { name: 'table', code: parts[1].toUpperCase().slice(0, 4) };
  if (parts[0] === 'solo') return { name: 'solo' };
  if (parts[0] === 'regles') return { name: 'rules' };
  return { name: 'home' };
}

function useRoute() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const onChange = () => { setRoute(parseRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

// Une table en réseau : ce téléphone l'héberge (la partie est dans son stockage) ou s'y assoit.
function TableContainer({ code }) {
  const [role] = useState(() => (storage.loadHost(code) ? 'host' : 'guest'));
  const [joinName, setJoinName] = useState(null);
  const seated = role === 'host' || Boolean(storage.getToken(code)) || Boolean(joinName);
  const [state, setState] = useState(null);
  const [conn, setConn] = useState('connecting');
  const [fatal, setFatal] = useState(null);
  const session = useRef(null);
  const latest = useRef(-1);
  useWakeLock(seated && !fatal);

  const accept = (next) => {
    if (!next || typeof next.version !== 'number') return;
    if (next.version < latest.current) return;  // un état en retard ne doit pas écraser le plus récent
    latest.current = next.version;
    setState(next);
  };

  useEffect(() => {
    if (!seated) return undefined;
    const common = { onState: accept, onStatus: setConn, onFatal: setFatal };
    const s = role === 'host'
      ? hostTable({ ...common, game: storage.loadHost(code) })
      : joinTable({ ...common, code, name: joinName, onWelcome: (token) => storage.setToken(code, token) });
    session.current = s;
    return () => s.close();
  }, [seated]);

  const act = async (body) => {
    try {
      await session.current.act(body);
    } catch (e) {
      toast(e.message, { error: true });
    }
  };

  const leave = async () => {
    if (role === 'host') {
      const inGame = state && !['lobby', 'finished'].includes(state.phase);
      if (inGame && !confirm('Fermer la table ? La partie s\'arrête pour tout le monde.')) return;
      session.current.end();
    } else if (state && state.phase === 'lobby') {
      try { await session.current.act({ type: 'remove', player_id: state.me }); } catch (_) { /* on part quand même */ }
      storage.clearToken(code);
    }
    navigate('#/');
  };

  if (fatal) {
    return html`<div class="screen">
      <${Brand} />
      <div class="panel col">
        <h2>Table ${code}</h2>
        <p class="muted">${fatal}</p>
        <a class="btn primary" href="#/">Retour à l'accueil</a>
      </div>
    </div>`;
  }
  if (!seated) return html`<${JoinForm} code=${code} onJoin=${setJoinName} />`;
  if (!state) {
    return html`<div class="screen">
      <${Brand} />
      <div class="panel col">
        <p class="muted">Connexion à la table ${code}…</p>
        ${conn === 'host-missing' ? html`<p class="small">Table introuvable pour l'instant : vérifie le code, ou demande
          à l'hôte de rallumer son téléphone. On réessaie tout seul.</p>` : null}
        <a class="link" href="#/">Retour</a>
      </div>
    </div>`;
  }
  const props = { state, act, conn, role, onLeave: leave };
  if (state.phase === 'lobby') return html`<${Lobby} ...${props} />`;
  return html`<${Table} ...${props} />`;
}

function App() {
  const route = useRoute();
  let screen;
  if (route.name === 'table') screen = html`<${TableContainer} key=${route.code} code=${route.code} />`;
  else if (route.name === 'solo') screen = html`<${LocalTable} />`;
  else if (route.name === 'rules') screen = html`<${Rules} />`;
  else screen = html`<${Home} />`;
  return html`<div class="app">${screen}<${Toasts} /></div>`;
}

render(html`<${App} />`, document.getElementById('app'));
