// Un seul téléphone : on inscrit les joueurs, puis on se passe l'appareil. Entre deux
// tours, un écran de passage cache la main du joueur précédent.
import { useRef, useState } from 'preact/hooks';
import { html } from '../html.js';
import * as E from '../engine.js';
import { storage } from '../storage.js';
import { TopBar, navigate, toast, useWakeLock } from '../ui.js';
import { RulesButton } from './rules.js';
import { Contract, Felt, Scoreboard, Table, useNames } from './table.js';

const HIDDEN_HAND = ['deal', 'bidding', 'playing'];
const AS_HOST = ['options', 'start', 'next', 'replay'];  // actions de la table, pas d'un joueur

function LocalLobby({ game, onStart }) {
  const [names, setNames] = useState(() => (game ? game.players.map((p) => p.name) : [storage.getName()].filter(Boolean)));
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState(game ? game.target : 10);
  const [der, setDer] = useState(game ? game.dix_de_der : true);
  const [belote, setBelote] = useState(game ? game.belote : true);
  const full = names.length >= E.MAX_PLAYERS;

  const add = (e) => {
    e.preventDefault();
    const n = draft.trim().slice(0, E.NAME_MAX);
    if (!n) return;
    if (names.some((x) => x.toLowerCase() === n.toLowerCase())) { toast('Ce prénom est déjà pris', { error: true }); return; }
    setNames([...names, n]);
    setDraft('');
  };

  const start = () => {
    const { game: g, host } = E.newGame('SOLO', names[0]);
    for (const n of names.slice(1)) E.join(g, n);
    for (const p of g.players) p.connected = true;
    E.setOptions(g, host, { target, dix_de_der: der, belote });
    E.start(g, host);
    onStart(g);
  };

  return html`<div class="screen">
    <${TopBar} conn="local"><${RulesButton} /></${TopBar}>
    <section class="panel col">
      <h3>Un seul téléphone</h3>
      <p class="small muted">Inscris les joueurs dans l'ordre où vous êtes assis. À chaque tour, le jeu dit
        à qui passer le téléphone et cache les cartes du précédent.</p>
      <ul class="seats">
        ${names.map((n, i) => html`<li key=${n}>
          <span class="seat-no">${i + 1}</span><span class="grow">${n}</span>
          <button class="icon-btn" type="button" aria-label=${`Retirer ${n}`}
            onClick=${() => setNames(names.filter((x) => x !== n))}>✕</button>
        </li>`)}
      </ul>
      ${full ? null : html`<form class="row" onSubmit=${add}>
        <input class="grow" type="text" maxlength=${E.NAME_MAX} placeholder=${names.length ? 'Joueur suivant' : 'Premier joueur'}
          value=${draft} onInput=${(e) => setDraft(e.currentTarget.value)} />
        <button class="btn" type="submit">Ajouter</button>
      </form>`}
    </section>

    <section class="panel col">
      <h3>Réglages</h3>
      <div class="segmented">
        ${E.TARGETS.map((t) => html`<button key=${t} type="button" class=${t === target ? 'on' : ''} onClick=${() => setTarget(t)}>${t}</button>`)}
      </div>
      <span class="tiny muted">points pour gagner</span>
      <label class="toggle"><span class="grow"><b>Dix de der</b></span>
        <input type="checkbox" checked=${der} onChange=${(e) => setDer(e.currentTarget.checked)} /><i class="switch"></i></label>
      <label class="toggle"><span class="grow"><b>Belote-rebelote</b></span>
        <input type="checkbox" checked=${belote} onChange=${(e) => setBelote(e.currentTarget.checked)} /><i class="switch"></i></label>
    </section>

    <div class="col sticky-actions">
      <button class="btn primary big" type="button" disabled=${names.length < E.MIN_PLAYERS} onClick=${start}>
        Distribuer${names.length < E.MIN_PLAYERS ? ` (${E.MIN_PLAYERS} joueurs min.)` : ''}
      </button>
      <a class="link center small" href="#/">Retour</a>
    </div>
  </div>`;
}

// Écran de passage : personne ne voit de main tant que le bon joueur n'a pas dit « c'est moi ».
function Handoff({ game, onReady }) {
  const state = E.buildView(game, null);
  const name = useNames(state);
  const who = E.player(game, game.turn);
  const what = { deal: 'de donner', bidding: "d'annoncer", playing: 'de jouer' }[game.phase];
  return html`<div class="screen table-screen">
    <${TopBar} label="1 téléphone" conn="local"><${RulesButton} state=${state} /></${TopBar}>
    <${Scoreboard} state=${state} />
    <${Contract} state=${state} name=${name} />
    <${Felt} state=${state} name=${name} />
    <div class="panel col handoff">
      <p class="muted">Passe le téléphone à</p>
      <h2 class="handoff-name">${who.name}</h2>
      <p class="small muted">C'est son tour ${what}.</p>
      <button class="btn primary big" type="button" onClick=${onReady}>C'est moi, ${who.name}</button>
    </div>
  </div>`;
}

export function LocalTable() {
  const game = useRef(E.upgrade(storage.loadLocal()));
  const [, setTick] = useState(0);
  const [viewer, setViewer] = useState(null);
  const [editing, setEditing] = useState(() => !game.current || game.current.phase === 'lobby');
  const g = game.current;
  useWakeLock(Boolean(g) && !editing);

  const commit = () => {
    storage.saveLocal(game.current);
    setTick((t) => t + 1);
  };

  if (editing || !g) {
    return html`<${LocalLobby} game=${g} onStart=${(fresh) => {
      game.current = fresh;
      setViewer(null);
      setEditing(false);
      commit();
    }} />`;
  }

  const act = async (body) => {
    const actor = AS_HOST.includes(body.type) ? E.player(g, g.host) : E.player(g, viewer);
    try {
      E.apply(g, actor, body);
    } catch (e) {
      toast(e.detail || e.message, { error: true });
      return;
    }
    if (g.phase === 'lobby') setEditing(true);  // « Nouvelle partie » : on repasse par l'inscription
    commit();
  };

  const leave = () => {
    if (g.phase !== 'finished' && !confirm('Arrêter la partie ?')) return;
    storage.dropLocal();
    navigate('#/');
  };

  const secret = HIDDEN_HAND.includes(g.phase);
  if (secret && viewer !== g.turn) return html`<${Handoff} game=${g} onReady=${() => setViewer(g.turn)} />`;
  const state = E.buildView(g, secret ? viewer : null);
  return html`<${Table} state=${state} act=${act} conn="local" role="local" label="1 téléphone" onLeave=${leave} />`;
}
