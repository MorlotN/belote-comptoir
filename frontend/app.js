import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from './html.js';
import { api, storage } from './api.js';
import { connectGame } from './ws.js';
import { Brand, Toasts, navigate, toast } from './ui.js';
import { Home, JoinForm } from './screens/home.js';
import { Lobby } from './screens/lobby.js';
import { Table } from './screens/table.js';
import { Rules } from './screens/rules.js';

// Routes : #/ , #/t/CODE , #/regles
function parseRoute() {
  const parts = (location.hash || '#/').slice(1).split('/').filter(Boolean);
  if (parts[0] === 't' && parts[1]) return { name: 'table', code: parts[1].toUpperCase() };
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

// Une table : jeton de la place, connexion temps réel, état le plus récent.
function TableContainer({ code }) {
  const [token, setToken] = useState(() => storage.getToken(code));
  const [state, setState] = useState(null);
  const [conn, setConn] = useState('connecting');
  const [fatal, setFatal] = useState(null);
  const latest = useRef(-1);

  const accept = (next) => {
    if (!next || typeof next.version !== 'number') return;
    if (next.version < latest.current) return;  // une réponse en retard ne doit pas écraser l'état
    latest.current = next.version;
    setState(next);
  };

  useEffect(() => {
    if (!token) return undefined;
    const socket = connectGame(code, token, {
      onState: accept,
      onStatus: setConn,
      onError: (detail) => {
        storage.clearToken(code);
        setFatal(detail);
      },
      onWake: () => api.state(code, token).then(accept).catch(() => {}),
    });
    return () => socket.close();
  }, [code, token]);

  const act = async (body) => {
    try {
      const next = await api.act(code, token, body);
      if (next && next.left) {
        storage.clearToken(code);
        navigate('#/');
        return;
      }
      accept(next);
    } catch (e) {
      toast(e.message, { error: true });
    }
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
  if (!token) {
    return html`<${JoinForm} code=${code} onJoined=${(res) => {
      storage.setToken(res.code, res.token);
      accept(res.state);
      setToken(res.token);
    }} />`;
  }
  if (!state) {
    return html`<div class="screen"><${Brand} /><p class="muted center mt">Connexion à la table ${code}…</p></div>`;
  }
  if (state.phase === 'lobby') return html`<${Lobby} state=${state} act=${act} conn=${conn} />`;
  return html`<${Table} state=${state} act=${act} conn=${conn} />`;
}

function App() {
  const route = useRoute();
  let screen;
  if (route.name === 'table') screen = html`<${TableContainer} key=${route.code} code=${route.code} />`;
  else if (route.name === 'rules') screen = html`<${Rules} />`;
  else screen = html`<${Home} />`;
  return html`<div class="app">${screen}<${Toasts} /></div>`;
}

render(html`<${App} />`, document.getElementById('app'));
