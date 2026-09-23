// La table : adversaires en haut, tapis au milieu, ta main en bas.
import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from '../html.js';
import { Card, CardBacks, SUITS, SUIT_NAME, SUIT_SYMBOL, Suit, cardName } from '../cards.js';
import { TopBar, plural } from '../ui.js';

const ACTIVE = ['deal', 'bidding', 'trump', 'playing'];

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
  const taker = r && r.taker === p.id && ['trump', 'playing'].includes(state.phase);
  return html`<div class=${cls.join(' ')}>
    <div class="seat-top">
      <span class="seat-name">${p.id === state.me ? 'Toi' : p.name}</span>
      <span class="score" title="points de partie">${p.score}</span>
    </div>
    <div class="seat-info">
      ${p.dealer && ACTIVE.includes(state.phase) ? html`<span class="tag">donne</span>` : null}
      ${taker ? html`<span class="tag hot">preneur</span>` : null}
      ${bid ? html`<span class=${`tag ${bid === 'passe' ? '' : 'hot'}`}>${bid}</span>` : null}
      ${state.phase === 'playing' && p.tricks ? html`<span class="tiny muted">${plural(p.tricks, 'pli')}</span>` : null}
      ${p.id !== state.me ? html`<${CardBacks} count=${p.cards} />` : null}
      ${!p.connected ? html`<span class="tiny muted">hors ligne</span>` : null}
    </div>
  </div>`;
}

function Contract({ state, name }) {
  const r = state.round;
  if (!r) return null;
  let text;
  if (state.phase === 'deal') text = `Manche ${r.number} · ${name(r.dealer)} donne`;
  else if (state.phase === 'bidding') {
    text = r.taker ? html`Plus haute annonce : <b>${r.high_bid}</b> (${name(r.taker)})` : 'Pas encore d\'annonce';
  } else if (r.trump) {
    text = html`${name(r.taker)} doit faire <b>${r.high_bid}</b> · atout <${Suit} suit=${r.trump} /> ${SUIT_NAME[r.trump]}`;
  } else text = html`${name(r.taker)} prend à <b>${r.high_bid}</b>`;
  return html`<div class="contract">
    <span>${text}</span>
    ${r.cards_each ? html`<span class="tiny muted">${plural(r.cards_each, 'carte')} chacun</span>` : null}
  </div>`;
}

function Felt({ state, name }) {
  const r = state.round;
  let cards = r.trick;
  let caption = null;
  let faded = false;
  if (!cards.length && r.last_trick && state.phase === 'playing') {
    cards = r.last_trick.cards;
    faded = true;
    caption = r.last_trick.winner === state.me ? 'Tu ramasses le pli' : `Pli pour ${name(r.last_trick.winner)}`;
  }
  if (state.phase === 'bidding' || state.phase === 'trump') {
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
        <${Card} card=${t.card} size="table" trump=${r.trump} />
        <span class="who">${name(t.player)}</span>
      </div>`)}
      ${!cards.length ? html`<p class="felt-hint">${state.turn === state.me ? 'Tu entames' : `${name(state.turn)} entame`}</p>` : null}
    </div>
    ${caption ? html`<p class="caption">${caption}</p>` : null}
  </div>`;
}

function DealPicker({ state, act }) {
  const max = state.limits.max_cards;
  return html`<div class="panel col action">
    <h3>Tu donnes : combien de cartes chacun ?</h3>
    <div class="picker">
      ${Array.from({ length: max }, (_, i) => i + 1).map((n) => html`<button key=${n} type="button" class="btn big"
        onClick=${() => act({ type: 'deal', cards: n })}>${n}</button>`)}
    </div>
    <p class="tiny muted">Peu de cartes, c'est du bluff ; cinq, c'est de la belote.</p>
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
      Si tu remportes l'enchère, c'est toi qui choisis l'atout et qui entames.</p>
  </div>`;
}

function TrumpPicker({ state, act }) {
  return html`<div class="panel col action">
    <h3>Tu prends à ${state.round.high_bid} : choisis l'atout</h3>
    <div class="suits">
      ${SUITS.map((s) => html`<button key=${s} type="button" class=${`btn suit-btn ${['H', 'D'].includes(s) ? 'red' : 'black'}`}
        onClick=${() => act({ type: 'trump', suit: s })} aria-label=${SUIT_NAME[s]}>
        <span class="suit-big">${SUIT_SYMBOL[s]}</span><span class="tiny">${SUIT_NAME[s]}</span>
      </button>`)}
    </div>
  </div>`;
}

function Waiting({ text }) {
  return html`<p class="waiting">${text}<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>`;
}

function StandIn({ state, act, name }) {
  const p = state.players.find((x) => x.id === state.turn);
  if (!p || p.connected || p.id === state.me || state.me !== state.host || !ACTIVE.includes(state.phase)) return null;
  return html`<button type="button" class="btn small ghost" onClick=${() => act({ type: 'stand_in' })}>
    ${name(p.id)} a décroché : jouer à sa place
  </button>`;
}

function Hand({ state, act }) {
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
      ? html`<button type="button" class="btn primary" onClick=${() => act({ type: 'play', card: sel })}>Poser ${cardName(sel, true)}</button>`
      : 'À toi : touche une carte'}</p>` : null}
    <div class="hand">
      ${state.hand.map((c) => html`<${Card} key=${c} card=${c} trump=${r && r.trump}
        dim=${myTurn && !playable.has(c)} playable=${myTurn && playable.has(c)} selected=${sel === c}
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
      ${made ? html` +1 pour ${mine ? 'toi' : name(res.taker)}.` : html` +1 pour chacun des autres.`}`;
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
        <td><b>${p.score}</b>${res.gained.includes(p.id) ? html` <span class="plus">+1</span>` : null}</td>
      </tr>`)}</tbody>
    </table>`}
    ${res.tie ? html`<p class="small accent">Égalité en tête : on joue jusqu'à ce qu'un seul passe devant.</p>` : null}
    <button type="button" class="btn primary big" onClick=${() => act({ type: 'next', round: r.number })}>
      Manche suivante · ${nextDealer.id === state.me ? 'tu donnes' : `${nextDealer.name} donne`}
    </button>
  </div>`;
}

function Final({ state, act }) {
  const winner = state.players.find((p) => p.id === state.winners[0]);
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const isHost = state.me === state.host;
  return html`<div class="panel col result final">
    <div class="trophy" aria-hidden="true">🏆</div>
    <h2>${winner.id === state.me ? 'Tu gagnes la partie !' : `${winner.name} gagne la partie !`}</h2>
    <ol class="ranking">
      ${ranked.map((p) => html`<li key=${p.id}><span class="grow">${p.id === state.me ? 'Toi' : p.name}</span><b>${p.score}</b></li>`)}
    </ol>
    ${isHost
      ? html`<button type="button" class="btn primary big" onClick=${() => act({ type: 'replay' })}>Nouvelle partie à la même table</button>`
      : html`<${Waiting} text="L'hôte peut relancer une partie" />`}
    <a class="link center small" href="#/">Quitter</a>
  </div>`;
}

function Slate({ state, name, onClose }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  return html`<div class="overlay" onClick=${onClose}>
    <div class="sheet col" onClick=${(e) => e.stopPropagation()}>
      <div class="row"><h2 class="grow">L'ardoise</h2><button class="icon-btn" type="button" onClick=${onClose} aria-label="Fermer">✕</button></div>
      <p class="small muted">Premier à ${state.target} points, seul en tête.</p>
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
    </div>
  </div>`;
}

export function Table({ state, act, conn }) {
  const [slate, setSlate] = useState(false);
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
  const name = (id) => (id === state.me ? 'Toi' : (byId[id] ? byId[id].name : '?'));
  const r = state.round;
  const myTurn = state.turn === state.me && ACTIVE.includes(state.phase);
  useTurnAlert(myTurn);

  const i = state.players.findIndex((p) => p.id === state.me);
  const others = [...state.players.slice(i + 1), ...state.players.slice(0, i)];
  const me = state.players[i];
  const turnName = byId[state.turn] ? byId[state.turn].name : '';

  let panel = null;
  if (state.phase === 'deal') {
    panel = myTurn ? html`<${DealPicker} state=${state} act=${act} />` : html`<${Waiting} text=${`${turnName} choisit combien de cartes donner`} />`;
  } else if (state.phase === 'bidding') {
    if (myTurn) panel = html`<${BidPicker} key=${r.number} state=${state} act=${act} />`;
    else panel = html`<${Waiting} text=${`${me.passed ? 'Tu as passé. ' : ''}${turnName} réfléchit`} />`;
  } else if (state.phase === 'trump') {
    panel = myTurn ? html`<${TrumpPicker} state=${state} act=${act} />` : html`<${Waiting} text=${`${turnName} choisit l'atout`} />`;
  } else if (state.phase === 'playing' && !myTurn) {
    panel = html`<${Waiting} text=${`${turnName} joue`} />`;
  }

  return html`<div class="screen table-screen">
    <${TopBar} code=${state.code} conn=${conn}>
      <button class="btn tiny" type="button" onClick=${() => setSlate(true)}>Ardoise</button>
    </${TopBar}>

    <div class="opponents">${others.map((p) => html`<${Seat} key=${p.id} p=${p} state=${state} />`)}</div>

    ${state.phase === 'finished'
      ? html`<${Final} state=${state} act=${act} />`
      : state.phase === 'round_end'
        ? html`<${RoundResult} state=${state} act=${act} name=${name} />`
        : html`<${Contract} state=${state} name=${name} /><${Felt} state=${state} name=${name} />`}

    <div class="bottom">
      ${panel}
      <${StandIn} state=${state} act=${act} name=${name} />
      <${Seat} p=${me} state=${state} />
      ${ACTIVE.includes(state.phase) ? html`<${Hand} state=${state} act=${act} />` : null}
    </div>

    ${slate ? html`<${Slate} state=${state} name=${name} onClose=${() => setSlate(false)} />` : null}
  </div>`;
}
