// La table : adversaires en haut, tapis au milieu, ta main en bas.
import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from '../html.js';
import { Card, CardBacks, SUIT_NAME, Suit, cardName } from '../cards.js';
import { ConnBanner, Sheet, TopBar, goal, plural, useHelp } from '../ui.js';
import { points } from '../engine.js';
import { CheatSheet, RulesSheet } from './rules.js';

const ACTIVE = ['deal', 'bidding', 'playing'];

function useTurnAlert(active) {
  const prev = useRef(false);
  useEffect(() => {
    if (active && !prev.current) {
      try { if (navigator.vibrate) navigator.vibrate(60); } catch (_) { /* pas de vibreur */ }
    }
    prev.current = active;
    document.title = active ? '● À toi ! · Belote de comptoir' : 'Belote de comptoir';
    return () => { document.title = 'Belote de comptoir'; };
  }, [active]);
}

function bidLabel(bid) {
  if (bid === 'none' || bid === undefined) return null;
  return bid === null ? 'passe' : String(bid);
}

function Seat({ p, state }) {
  const r = state.round;
  const cls = ['seat'];
  if (state.turn === p.id && ACTIVE.includes(state.phase)) cls.push('turn');
  if (!p.connected) cls.push('away');
  if (p.id === state.me) cls.push('me');
  const bid = state.phase === 'bidding' ? bidLabel(p.bid) : null;
  const taker = r && r.taker === p.id && state.phase === 'playing';
  return html`<div class=${cls.join(' ')}>
    <div class="seat-top">
      <span class="seat-name">${p.id === state.me ? 'Toi' : p.name}</span>
      ${state.phase === 'playing' ? html`<span class="round-pts" title="points ramassés dans la manche">${p.points} pts</span>` : null}
    </div>
    <div class="seat-info">
      ${p.dealer && ACTIVE.includes(state.phase) ? html`<span class="tag">donne</span>` : null}
      ${taker ? html`<span class="tag hot">preneur · ${p.points}/${r.high_bid}</span>` : null}
      ${bid ? html`<span class=${`tag ${bid === 'passe' ? '' : 'hot'}`}>${bid}</span>` : null}
      ${state.phase === 'playing' && p.tricks ? html`<span class="tiny muted">${plural(p.tricks, 'pli')}</span>` : null}
      ${p.id !== state.me ? html`<${CardBacks} count=${p.cards} />` : null}
      ${!p.connected ? html`<span class="tiny muted">hors ligne</span>` : null}
    </div>
  </div>`;
}

export function Contract({ state, name }) {
  const r = state.round;
  if (!r) return null;
  let text;
  if (state.phase === 'deal') text = `Manche ${r.number} · ${r.dealer === state.me ? 'tu donnes' : `${name(r.dealer)} donne`}`;
  else if (state.phase === 'bidding') {
    text = r.taker ? html`Plus haute annonce : <b>${r.high_bid}</b> (${name(r.taker)})` : 'Pas encore d\'annonce';
  } else if (r.trump) {
    text = html`${name(r.taker)} doit faire <b>${r.high_bid}</b> · atout <${Suit} suit=${r.trump} /> ${SUIT_NAME[r.trump]}`;
  } else if (r.taker === state.me) {
    text = html`Tu dois faire <b>${r.high_bid}</b> · ta première carte donne l'atout`;
  } else text = html`${name(r.taker)} doit faire <b>${r.high_bid}</b> · sa première carte donnera l'atout`;
  return html`<div class="contract">
    <span>${text}</span>
    ${r.cards_each ? html`<span class="tiny muted">${plural(r.cards_each, 'carte')} chacun</span>` : null}
  </div>`;
}

export function Felt({ state, name, help }) {
  const r = state.round;
  let cards = r.trick;
  let caption = null;
  let faded = false;
  if (!cards.length && r.last_trick && state.phase === 'playing') {
    cards = r.last_trick.cards;
    faded = true;
    caption = r.last_trick.winner === state.me ? 'Tu ramasses le pli' : `Pli pour ${name(r.last_trick.winner)}`;
  }
  if (state.phase === 'bidding') {
    return html`<div class="felt">
      <div class="bids">
        ${r.bids.length === 0 ? html`<p class="felt-hint">${state.turn === state.me ? 'Tu parles' : `${name(state.turn)} parle`} en premier</p>` : null}
        ${r.bids.map((b, i) => html`<span key=${i} class=${`bid-chip ${b.value === null ? 'pass' : ''}`}>
          ${name(b.player)} <b>${b.value === null ? 'passe' : b.value}</b>
        </span>`)}
      </div>
    </div>`;
  }
  if (state.phase === 'deal') {
    return html`<div class="felt"><div class="deck" aria-hidden="true"><i></i><i></i><i></i></div></div>`;
  }
  return html`<div class=${`felt ${faded ? 'faded' : ''}`}>
    <div class="trick">
      ${cards.map((t) => html`<div key=${t.card} class=${`played ${faded && t.player === r.last_trick.winner ? 'winner' : ''}`}>
        ${t.say ? html`<span class="say">${t.say} !</span>` : null}
        <${Card} card=${t.card} size="table" trump=${r.trump} value=${help ? points(t.card, r.trump) : undefined} />
        <span class="who">${name(t.player)}</span>
      </div>`)}
      ${!cards.length ? html`<p class="felt-hint">${state.turn === state.me ? 'Tu entames' : `${name(state.turn)} entame`}${r.trump ? '' : ' : cette carte donnera l\'atout'}</p>` : null}
    </div>
    ${caption ? html`<p class="caption">${caption}</p>` : null}
  </div>`;
}

function DealPicker({ state, act }) {
  const max = state.limits.max_cards;
  return html`<div class="panel col action">
    <h3>Tu donnes : combien de cartes chacun ?</h3>
    <div class=${`picker ${max > 5 ? 'two-rows' : ''}`}>
      ${Array.from({ length: max }, (_, i) => i + 1).map((n) => html`<button key=${n} type="button" class="btn big"
        onClick=${() => act({ type: 'deal', cards: n })}>${n}</button>`)}
    </div>
    <p class="tiny muted">Peu de cartes, c'est du bluff${max >= 8 ? ' ; huit, c\'est une donne de belote complète' : ''}.</p>
  </div>`;
}

function BidPicker({ state, act }) {
  const r = state.round;
  const min = r.high_bid + 1;
  const max = state.limits.max_bid;
  const [value, setValue] = useState(min);
  useEffect(() => { setValue((v) => Math.max(v, min)); }, [min]);
  const step = (d) => setValue((v) => Math.min(max, Math.max(min, v + d)));
  return html`<div class="panel col action">
    <h3>À toi d'annoncer</h3>
    <div class="stepper">
      <button type="button" class="btn" onClick=${() => step(-5)} disabled=${value <= min}>−5</button>
      <button type="button" class="btn" onClick=${() => step(-1)} disabled=${value <= min}>−1</button>
      <output class="bid-value">${value}</output>
      <button type="button" class="btn" onClick=${() => step(1)} disabled=${value >= max}>+1</button>
      <button type="button" class="btn" onClick=${() => step(5)} disabled=${value >= max}>+5</button>
    </div>
    <div class="row">
      <button type="button" class="btn grow" onClick=${() => act({ type: 'bid' })}>Passer</button>
      <button type="button" class="btn primary grow" onClick=${() => act({ type: 'bid', value })}>Annoncer ${value}</button>
    </div>
    <p class="tiny muted">Les points que tu comptes ramasser dans tes plis${state.options.dix_de_der ? ', dix de der compris' : ''}.
      Si tu remportes l'enchère, tu entames, et la couleur de ta première carte devient l'atout.</p>
  </div>`;
}

export function Waiting({ text }) {
  return html`<p class="waiting">${text}<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>`;
}

function StandIn({ state, act, name }) {
  const p = state.players.find((x) => x.id === state.turn);
  if (!p || p.connected || p.id === state.me || state.me !== state.host || !ACTIVE.includes(state.phase)) return null;
  return html`<button type="button" class="btn small ghost" onClick=${() => act({ type: 'stand_in' })}>
    ${name(p.id)} a décroché : jouer à sa place
  </button>`;
}

function Hand({ state, act, help }) {
  const r = state.round;
  const myTurn = state.phase === 'playing' && state.turn === state.me;
  const [sel, setSel] = useState(null);
  useEffect(() => { setSel(null); }, [state.hand.join(','), myTurn]);
  if (!state.hand.length) return null;
  const playable = new Set(state.playable);
  const tap = (card) => {
    if (!myTurn || !playable.has(card)) return;
    if (sel === card) act({ type: 'play', card });
    else setSel(card);
  };
  return html`<div class="hand-zone">
    ${myTurn ? html`<p class="hand-hint">${sel
      ? html`<button type="button" class="btn primary" onClick=${() => act({ type: 'play', card: sel })}>
          Poser ${cardName(sel, true)}${r.trump ? '' : ` · atout ${SUIT_NAME[sel.slice(-1)]}`}</button>`
      : r.trump ? 'À toi : touche une carte' : 'Ta première carte donne l\'atout : touche une carte'}</p>` : null}
    <div class="hand" style=${`--n: ${state.hand.length}`}>
      ${state.hand.map((c) => html`<${Card} key=${c} card=${c} trump=${r && r.trump}
        dim=${myTurn && !playable.has(c)} playable=${myTurn && playable.has(c)} selected=${sel === c}
        value=${help ? points(c, r && r.trump) : undefined}
        onClick=${myTurn ? () => tap(c) : null} />`)}
    </div>
  </div>`;
}

function RoundResult({ state, act, name }) {
  const r = state.round;
  const res = r.result;
  const n = state.players.length;
  const dealerSeat = state.players.findIndex((p) => p.id === r.dealer);
  const nextDealer = state.players[(dealerSeat + 1) % n];
  let head;
  let detail = null;
  if (res.void) {
    head = 'Tout le monde passe';
    detail = 'Personne ne marque, la donne tourne.';
  } else {
    const mine = res.taker === state.me;
    const made = res.made;
    head = mine ? (made ? 'Tu tiens ton contrat !' : 'Tu chutes…') : `${name(res.taker)} ${made ? 'tient son contrat' : 'chute'}`;
    detail = html`Annonce <b>${res.bid}</b> à <${Suit} suit=${res.trump} />, fait <b>${res.points[res.taker]}</b>.
      ${made ? html` +${res.gain || 1} pour ${mine ? 'toi' : name(res.taker)}.` : html` +${res.gain || 1} pour chacun des autres.`}`;
  }
  return html`<div class="panel col result">
    <h2 class=${res.void ? '' : res.made ? 'ok' : 'ko'}>${head}</h2>
    <p>${detail}</p>
    ${res.void ? null : html`<table class="scores">
      <thead><tr><th></th><th>Plis</th><th>Points</th><th>Partie</th></tr></thead>
      <tbody>${state.players.map((p) => html`<tr key=${p.id} class=${p.id === res.taker ? 'taker' : ''}>
        <td>${p.id === state.me ? 'Toi' : p.name}
          ${res.last === p.id ? html` <span class="tag">der</span>` : null}
          ${res.belote === p.id ? html` <span class="tag">belote</span>` : null}</td>
        <td>${res.tricks[p.id]}</td>
        <td>${res.points[p.id]}</td>
        <td><b>${p.score}</b>${res.gained.includes(p.id) ? html` <span class="plus">+${res.gain || 1}</span>` : null}</td>
      </tr>`)}</tbody>
    </table>`}
    ${res.tie ? html`<p class="small accent">Égalité en tête : on joue jusqu'à ce qu'un seul passe devant.</p>` : null}
    <button type="button" class="btn primary big" onClick=${() => act({ type: 'next', round: r.number })}>
      Manche suivante · ${nextDealer.id === state.me ? 'tu donnes' : `${nextDealer.name} donne`}
    </button>
  </div>`;
}

function Final({ state, act, role, onLeave }) {
  const winner = state.players.find((p) => p.id === state.winners[0]);
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const canReplay = role === 'host' || role === 'local';
  return html`<div class="panel col result final">
    <div class="trophy" aria-hidden="true">🏆</div>
    <h2>${winner.id === state.me ? 'Tu gagnes la partie !' : `${winner.name} gagne la partie !`}</h2>
    <ol class="ranking">
      ${ranked.map((p) => html`<li key=${p.id}><span class="grow">${p.id === state.me ? 'Toi' : p.name}</span><b>${p.score}</b></li>`)}
    </ol>
    ${canReplay
      ? html`<button type="button" class="btn primary big" onClick=${() => act({ type: 'replay' })}>Nouvelle partie à la même table</button>`
      : html`<${Waiting} text="L'hôte peut relancer une partie" />`}
    <button type="button" class="link center small" onClick=${onLeave}>${role === 'host' ? 'Fermer la table' : 'Quitter'}</button>
  </div>`;
}

function Slate({ state, name, role, onClose, onLeave }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  return html`<${Sheet} title="L'ardoise" onClose=${onClose}>
    <p class="small muted">Premier à ${goal(state)}, seul en tête.</p>
    <ol class="ranking">
      ${ranked.map((p) => html`<li key=${p.id}><span class="grow">${p.id === state.me ? 'Toi' : p.name}</span><b>${p.score}</b></li>`)}
    </ol>
    <h3>Manches</h3>
    ${state.history.length === 0 ? html`<p class="small muted">Rien encore.</p>` : null}
    <ul class="history">
      ${[...state.history].reverse().map((h) => html`<li key=${h.number}>
        <span class="muted">M${h.number}</span>
        ${h.void
          ? html`<span class="grow">${plural(h.cards, 'carte')}, tout le monde passe</span>`
          : html`<span class="grow">${name(h.taker)} ${h.bid} <${Suit} suit=${h.trump} /> · fait ${h.points[h.taker]} · ${plural(h.cards, 'carte')}</span>
             <span class=${h.made ? 'ok' : 'ko'}>${h.made ? 'tenu' : 'chute'}</span>`}
      </li>`)}
    </ul>
    ${state.phase !== 'finished' ? html`<button type="button" class="link center small" onClick=${onLeave}>
      ${{ host: 'Fermer la table', guest: 'Quitter la table', local: 'Arrêter la partie' }[role]}
    </button>` : null}
  </${Sheet}>`;
}

// Les points de partie, toujours sous les yeux : un point par manche, premier à `target`.
export function Scoreboard({ state }) {
  const top = Math.max(...state.players.map((p) => p.score));
  return html`<div class="scoreboard" aria-label="Scores de la partie">
    <span class="sb-title">Scores <span class="tiny muted">· premier à ${goal(state)}</span></span>
    <div class="sb-list">
      ${state.players.map((p) => html`<span key=${p.id}
        class=${`sb-item ${p.id === state.me ? 'me' : ''} ${top > 0 && p.score === top ? 'lead' : ''}`}>
        <span class="sb-name">${p.id === state.me ? 'Toi' : p.name}</span><b>${p.score}</b>
      </span>`)}
    </div>
  </div>`;
}

export function useNames(state) {
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
  return (id) => (id && id === state.me ? 'Toi' : (byId[id] ? byId[id].name : '?'));
}

// `role` : 'host' (la partie tourne ici), 'guest' (invité) ou 'local' (un seul téléphone,
// `state.me` est alors celui qui tient le téléphone, ou personne entre deux manches).
export function Table({ state, act, conn, role, label, onLeave }) {
  const [slate, setSlate] = useState(false);
  const [help, setHelp] = useHelp();
  const [rules, setRules] = useState(false);
  const name = useNames(state);
  const r = state.round;
  const myTurn = Boolean(state.me) && state.turn === state.me && ACTIVE.includes(state.phase);
  useTurnAlert(myTurn && role !== 'local');

  const i = state.players.findIndex((p) => p.id === state.me);
  const others = i < 0 ? state.players : [...state.players.slice(i + 1), ...state.players.slice(0, i)];
  const me = i < 0 ? null : state.players[i];
  const turnName = name(state.turn);

  let panel = null;
  if (state.phase === 'deal') {
    panel = myTurn ? html`<${DealPicker} state=${state} act=${act} />` : html`<${Waiting} text=${`${turnName} choisit combien de cartes donner`} />`;
  } else if (state.phase === 'bidding') {
    if (myTurn) panel = html`<${BidPicker} key=${r.number} state=${state} act=${act} />`;
    else panel = html`<${Waiting} text=${`${me && me.passed ? 'Tu as passé. ' : ''}${turnName} réfléchit`} />`;
  } else if (state.phase === 'playing' && !myTurn) {
    panel = html`<${Waiting} text=${`${turnName} joue`} />`;
  }

  return html`<div class=${`screen table-screen ${help ? 'with-help' : ''}`}>
    <${TopBar} label=${label || state.code} conn=${conn}>
      <button class=${`btn tiny ${help ? 'on' : ''}`} type="button" aria-pressed=${help} onClick=${() => setHelp(!help)}>Règles</button>
      <button class="btn tiny" type="button" onClick=${() => setSlate(true)}>Ardoise</button>
    </${TopBar}>
    <${ConnBanner} conn=${conn} role=${role} />
    <${Scoreboard} state=${state} />

    <div class="opponents">${others.map((p) => html`<${Seat} key=${p.id} p=${p} state=${state} />`)}</div>

    ${state.phase === 'finished'
      ? html`<${Final} state=${state} act=${act} role=${role} onLeave=${onLeave} />`
      : state.phase === 'round_end'
        ? html`<${RoundResult} state=${state} act=${act} name=${name} />`
        : html`<${Contract} state=${state} name=${name} /><${Felt} state=${state} name=${name} help=${help} />`}
    ${help ? html`<${CheatSheet} state=${state} onMore=${() => setRules(true)} onClose=${() => setHelp(false)} />` : null}

    <div class="bottom">
      ${panel}
      ${role === 'host' ? html`<${StandIn} state=${state} act=${act} name=${name} />` : null}
      ${me ? html`<${Seat} p=${me} state=${state} />` : null}
      ${me && ACTIVE.includes(state.phase) ? html`<${Hand} state=${state} act=${act} help=${help} />` : null}
    </div>

    ${rules ? html`<${RulesSheet} state=${state} onClose=${() => setRules(false)} />` : null}
    ${slate ? html`<${Slate} state=${state} name=${name} role=${role} onLeave=${onLeave} onClose=${() => setSlate(false)} />` : null}
  </div>`;
}
