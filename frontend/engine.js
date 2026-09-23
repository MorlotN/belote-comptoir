// Règles de la belote de comptoir : distribution, enchères, atout, plis, comptage.
//
// Le moteur est pur : il ne touche ni au réseau ni à l'écran. La partie est un objet
// JSON (on peut la sauver et la recharger telle quelle) ; chaque action vérifie qui
// la joue et à quel moment, puis modifie la partie ou lève `GameError`.
// La règle suivie est décrite dans docs/regles.md.

export const SUITS = ['S', 'H', 'C', 'D'];  // pique, cœur, trèfle, carreau : couleurs alternées à l'affichage
export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const DECK = SUITS.flatMap((s) => RANKS.map((r) => r + s));

const TRUMP_ORDER = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];
const PLAIN_ORDER = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];
const TRUMP_POINTS = { J: 20, 9: 14, A: 11, 10: 10, K: 4, Q: 3, 8: 0, 7: 0 };
const PLAIN_POINTS = { A: 11, 10: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MAX_CARDS = 5;
export const DIX_DE_DER = 10;
export const BELOTE = 20;
export const MAX_BID = 152 + DIX_DE_DER + BELOTE;  // au-delà, même en ramassant tout on ne tient pas
export const TARGETS = [3, 5, 10, 15, 20];
export const NAME_MAX = 20;

export class GameError extends Error {
  constructor(detail) {
    super(detail);
    this.name = 'GameError';
    this.detail = detail;
  }
}

// ----- hasard -----

function randomInt(n) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n;  // pas de biais modulo
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % n;
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomToken(bytes = 16) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ----- cartes -----

export const rank = (card) => card.slice(0, -1);
export const suit = (card) => card.slice(-1);

export function points(card, trump) {
  return (suit(card) === trump ? TRUMP_POINTS : PLAIN_POINTS)[rank(card)];
}

// Force d'une carte dans un pli : un atout bat tout, puis la couleur demandée, le reste ne vaut rien.
export function strength(card, trump, led) {
  if (suit(card) === trump) return 100 + TRUMP_ORDER.indexOf(rank(card));
  if (suit(card) === led) return 10 + PLAIN_ORDER.indexOf(rank(card));
  return 0;
}

export function trickWinner(trick, trump) {
  const led = suit(trick[0].card);
  let best = trick[0];
  for (const t of trick) if (strength(t.card, trump, led) > strength(best.card, trump, led)) best = t;
  return best.player;
}

// Obligations de la belote classique, chacun pour soi : fournir, sinon couper, et monter
// à l'atout dès qu'on le peut. Qui ne peut pas monter coupe quand même.
export function legalCards(hand, trick, trump) {
  if (!trick.length) return [...hand];
  const led = suit(trick[0].card);
  const follow = hand.filter((c) => suit(c) === led);
  const trumps = hand.filter((c) => suit(c) === trump);
  const best = Math.max(-1, ...trick.filter((t) => suit(t.card) === trump).map((t) => TRUMP_ORDER.indexOf(rank(t.card))));
  const over = (cards) => cards.filter((c) => TRUMP_ORDER.indexOf(rank(c)) > best);
  if (led === trump) {
    if (follow.length) return over(follow).length ? over(follow) : follow;
    return [...hand];
  }
  if (follow.length) return follow;
  if (trumps.length) return over(trumps).length ? over(trumps) : trumps;
  return [...hand];
}

export function sortHand(hand, trump) {
  const key = (c) => {
    const order = suit(c) === trump ? TRUMP_ORDER : PLAIN_ORDER;
    return SUITS.indexOf(suit(c)) * 10 + order.indexOf(rank(c));
  };
  return [...hand].sort((a, b) => key(a) - key(b));
}

// ----- partie -----

export const player = (game, id) => game.players.find((p) => p.id === id) || null;
export const playerByToken = (game, token) => (token ? game.players.find((p) => p.token === token) || null : null);
const seat = (game, id) => game.players.findIndex((p) => p.id === id);

// Les joueurs qui suivent `id` dans l'ordre du jeu, lui compris en dernier.
export function after(game, id) {
  const i = seat(game, id);
  const n = game.players.length;
  return Array.from({ length: n }, (_, k) => game.players[(i + k + 1) % n]);
}

function newPlayer(name) {
  return { id: randomToken(4), token: randomToken(18), name, score: 0, connected: false, hand: [], won: [], tricks: 0, passed: false };
}

export function cleanName(game, raw) {
  let name = String(raw || '').split(/\s+/).filter(Boolean).join(' ').slice(0, NAME_MAX);
  if (!name) throw new GameError('Choisis un pseudo');
  if (game) {
    const taken = new Set(game.players.map((p) => p.name.toLowerCase()));
    const base = name;
    let n = 2;
    while (taken.has(name.toLowerCase())) {
      name = `${base.slice(0, NAME_MAX - 3)} ${n}`;
      n += 1;
    }
  }
  return name;
}

export function newGame(code, hostName) {
  const host = newPlayer(cleanName(null, hostName));
  host.connected = true;
  return {
    game: {
      code, host: host.id, players: [host], phase: 'lobby', target: 10, dix_de_der: true, belote: true,
      round: null, rounds_played: 0, dealer_seat: 0, turn: null, winners: [], history: [], version: 0,
    },
    host,
  };
}

export function join(game, name) {
  if (game.phase !== 'lobby') throw new GameError('La partie a déjà commencé');
  if (game.players.length >= MAX_PLAYERS) throw new GameError(`La table est pleine (${MAX_PLAYERS} joueurs)`);
  const p = newPlayer(cleanName(game, name));
  game.players.push(p);
  return p;
}

// ----- actions -----

function require(cond, detail) {
  if (!cond) throw new GameError(detail);
}

function requireTurn(game, actor, phase) {
  require(game.phase === phase, "Ce n'est pas le moment");
  require(game.turn === actor.id, "Ce n'est pas ton tour");
}

const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

export function setOptions(game, actor, { target, dix_de_der: der, belote } = {}) {
  require(actor.id === game.host, "Seul l'hôte règle la partie");
  require(game.phase === 'lobby', 'La partie a déjà commencé');
  if (target !== undefined && target !== null) {
    require(TARGETS.includes(target), 'Objectif inconnu');
    game.target = target;
  }
  if (der !== undefined && der !== null) game.dix_de_der = Boolean(der);
  if (belote !== undefined && belote !== null) game.belote = Boolean(belote);
}

export function removePlayer(game, actor, targetId) {
  require(game.phase === 'lobby', 'On ne quitte pas une partie en cours');
  const target = player(game, targetId);
  require(target, 'Joueur inconnu');
  require(actor.id === targetId || actor.id === game.host, "Seul l'hôte peut retirer un joueur");
  require(targetId !== game.host, "L'hôte ne quitte pas sa propre table");
  game.players = game.players.filter((p) => p.id !== targetId);
}

export function start(game, actor) {
  require(actor.id === game.host, "Seul l'hôte lance la partie");
  require(game.phase === 'lobby', 'La partie a déjà commencé');
  require(game.players.length >= MIN_PLAYERS, `Il faut au moins ${MIN_PLAYERS} joueurs`);
  for (const p of game.players) p.score = 0;
  game.winners = [];
  game.history = [];
  game.rounds_played = 0;
  game.dealer_seat = randomInt(game.players.length);
  beginRound(game);
}

export function beginRound(game) {
  const dealer = game.players[game.dealer_seat % game.players.length];
  for (const p of game.players) Object.assign(p, { hand: [], won: [], tricks: 0, passed: false });
  game.round = {
    number: game.rounds_played + 1, dealer: dealer.id, cards_each: 0, bids: [], high_bid: 0, taker: null,
    trump: null, trick: [], last_trick: null, tricks_played: 0, belote_holder: null, belote_said: 0, result: null,
  };
  game.phase = 'deal';
  game.turn = dealer.id;
}

export const maxCards = (game) => Math.min(MAX_CARDS, Math.floor(DECK.length / Math.max(1, game.players.length)));

export function deal(game, actor, cards) {
  requireTurn(game, actor, 'deal');
  require(isInt(cards) && cards >= 1 && cards <= maxCards(game), `Entre 1 et ${maxCards(game)} cartes`);
  const deck = shuffle(DECK);
  // le donneur sert en commençant par le joueur qui le suit, comme à la table
  const order = after(game, actor.id);
  order.forEach((p, i) => { p.hand = sortHand(deck.slice(i * cards, (i + 1) * cards), null); });
  game.round.cards_each = cards;
  game.phase = 'bidding';
  game.turn = order[0].id;
}

export function bid(game, actor, value) {
  requireTurn(game, actor, 'bidding');
  const r = game.round;
  if (value === null || value === undefined) {
    actor.passed = true;
    value = null;
  } else {
    require(isInt(value), 'Annonce invalide');
    require(value > r.high_bid, `Il faut annoncer plus de ${r.high_bid}`);
    require(value >= 1 && value <= MAX_BID, `Une annonce va de 1 à ${MAX_BID}`);
    r.high_bid = value;
    r.taker = actor.id;
  }
  r.bids.push({ player: actor.id, value });
  const next = after(game, actor.id).find((p) => !p.passed);
  if (!next) voidRound(game);
  else if (next.id === r.taker) {
    game.phase = 'playing';
    game.turn = r.taker;  // le preneur entame, et sa première carte donne l'atout
  } else game.turn = next.id;
}

// L'atout n'est pas choisi : c'est la couleur de la première carte que pose le preneur.
function setTrump(game, trump) {
  const r = game.round;
  r.trump = trump;
  for (const p of game.players) {
    p.hand = sortHand(p.hand, trump);
    if (game.belote && p.hand.includes(`K${trump}`) && p.hand.includes(`Q${trump}`)) r.belote_holder = p.id;
  }
}

export function play(game, actor, card) {
  requireTurn(game, actor, 'playing');
  const r = game.round;
  require(actor.hand.includes(card), "Tu n'as pas cette carte");
  if (!r.trump) setTrump(game, suit(card));  // avant de retirer la carte : elle compte pour la belote
  require(legalCards(actor.hand, r.trick, r.trump).includes(card), 'Carte interdite : il faut fournir, couper ou monter');
  actor.hand = actor.hand.filter((c) => c !== card);
  let say = null;
  if (actor.id === r.belote_holder && (card === `K${r.trump}` || card === `Q${r.trump}`)) {
    r.belote_said += 1;
    say = r.belote_said === 1 ? 'Belote' : 'Rebelote';
  }
  r.trick.push({ player: actor.id, card, say });
  if (r.trick.length < game.players.length) {
    game.turn = after(game, actor.id)[0].id;
    return;
  }
  const winner = player(game, trickWinner(r.trick, r.trump));
  winner.won.push(...r.trick.map((t) => t.card));
  winner.tricks += 1;
  r.tricks_played += 1;
  r.last_trick = { cards: r.trick, winner: winner.id, number: r.tricks_played };
  r.trick = [];
  if (r.tricks_played < r.cards_each) game.turn = winner.id;
  else finishRound(game, winner.id);
}

export function roundPoints(game, last) {
  const r = game.round;
  const pts = Object.fromEntries(game.players.map((p) => [p.id, p.won.reduce((s, c) => s + points(c, r.trump), 0)]));
  if (game.dix_de_der && last) pts[last] += DIX_DE_DER;
  if (r.belote_holder) pts[r.belote_holder] += BELOTE;
  return pts;
}

function finishRound(game, last) {
  const r = game.round;
  const pts = roundPoints(game, last);
  const made = pts[r.taker] >= r.high_bid;
  const gained = made ? [r.taker] : game.players.filter((p) => p.id !== r.taker).map((p) => p.id);
  for (const p of game.players) if (gained.includes(p.id)) p.score += 1;
  r.result = {
    void: false, taker: r.taker, bid: r.high_bid, trump: r.trump, made, points: pts,
    tricks: Object.fromEntries(game.players.map((p) => [p.id, p.tricks])),
    last: game.dix_de_der ? last : null, belote: r.belote_holder, gained,
  };
  closeRound(game);
}

function voidRound(game) {
  game.round.result = { void: true, gained: [] };
  closeRound(game);
}

function closeRound(game) {
  const r = game.round;
  game.rounds_played += 1;
  game.history.push({ number: r.number, dealer: r.dealer, cards: r.cards_each, ...r.result });
  game.turn = null;
  const top = Math.max(...game.players.map((p) => p.score));
  const leaders = game.players.filter((p) => p.score === top).map((p) => p.id);
  r.result.tie = top >= game.target && leaders.length > 1;
  if (top >= game.target && leaders.length === 1) {
    game.phase = 'finished';
    game.winners = leaders;
  } else game.phase = 'round_end';
}

export function nextRound(game, actor, number) {
  require(game.phase === 'round_end', "La manche n'est pas finie");
  if (number !== undefined && number !== null) require(number === game.round.number, 'Déjà relancé');
  game.dealer_seat = (seat(game, game.round.dealer) + 1) % game.players.length;
  beginRound(game);
}

export function replay(game, actor) {
  require(actor.id === game.host, "Seul l'hôte relance");
  require(game.phase === 'finished', "La partie n'est pas finie");
  game.phase = 'lobby';
  game.round = null;
  game.turn = null;
  for (const p of game.players) Object.assign(p, { hand: [], won: [], tricks: 0, passed: false });
}

// L'hôte fait jouer le joueur dont c'est le tour quand son téléphone a décroché : il passe,
// sert 5 cartes, entame dans sa plus longue couleur, sinon joue sa plus petite carte permise.
export function standIn(game, actor) {
  require(actor.id === game.host, "Seul l'hôte peut jouer pour un absent");
  const target = player(game, game.turn);
  require(target && target.id !== actor.id, 'Personne à remplacer');
  require(!target.connected, `${target.name} est connecté, c'est à lui de jouer`);
  autoPlay(game, target);
}

export function autoPlay(game, target) {
  if (game.phase === 'deal') deal(game, target, maxCards(game));
  else if (game.phase === 'bidding') bid(game, target, null);
  else if (game.phase === 'playing') {
    const r = game.round;
    if (!r.trump) {  // entame du preneur : sa plus forte carte dans sa plus longue couleur devient l'atout
      const count = (s) => target.hand.filter((c) => suit(c) === s).length;
      const longest = SUITS.reduce((a, b) => (count(b) > count(a) ? b : a));
      const cards = target.hand.filter((c) => suit(c) === longest);
      play(game, target, cards.reduce((a, b) => (strength(b, longest, longest) > strength(a, longest, longest) ? b : a)));
      return;
    }
    const led = r.trick.length ? suit(r.trick[0].card) : null;
    const legal = legalCards(target.hand, r.trick, r.trump);
    const cost = (c) => points(c, r.trump) * 1000 + strength(c, r.trump, led || suit(c));
    play(game, target, legal.reduce((a, b) => (cost(b) < cost(a) ? b : a)));
  } else throw new GameError("Ce n'est pas le moment");
}

const ACTIONS = {
  options: (g, p, a) => setOptions(g, p, a),
  remove: (g, p, a) => removePlayer(g, p, a.player_id || p.id),
  start: (g, p) => start(g, p),
  deal: (g, p, a) => deal(g, p, a.cards),
  bid: (g, p, a) => bid(g, p, a.value),
  play: (g, p, a) => play(g, p, a.card),
  next: (g, p, a) => nextRound(g, p, a.round),
  replay: (g, p) => replay(g, p),
  stand_in: (g, p) => standIn(g, p),
};

// Une partie sauvée avant que l'atout soit donné par la première carte (23 sept. 2026)
// pouvait attendre un choix d'atout : le preneur entame simplement.
export function upgrade(game) {
  if (game && game.phase === 'trump') game.phase = 'playing';
  return game;
}

export function apply(game, actor, action) {
  const fn = action && typeof action === 'object' ? ACTIONS[action.type] : null;
  if (!fn) throw new GameError('Action inconnue');
  fn(game, actor, action);
  game.version += 1;
}

// ----- ce que voit chaque joueur : sa main, jamais celle des autres -----

export function buildView(game, meId) {
  const me = player(game, meId);
  const r = game.round;
  const lastBid = {};
  if (r) for (const b of r.bids) lastBid[b.player] = b.value;
  const view = {
    code: game.code,
    version: game.version,
    phase: game.phase,
    me: meId,
    host: game.host,
    turn: game.turn,
    target: game.target,
    options: { dix_de_der: game.dix_de_der, belote: game.belote },
    targets: TARGETS,
    limits: { min_players: MIN_PLAYERS, max_players: MAX_PLAYERS, max_cards: maxCards(game), max_bid: MAX_BID },
    players: game.players.map((p) => ({
      id: p.id, name: p.name, score: p.score, connected: p.connected, cards: p.hand.length, tricks: p.tricks,
      host: p.id === game.host, dealer: Boolean(r && r.dealer === p.id), passed: p.passed,
      bid: r && p.id in lastBid ? lastBid[p.id] : 'none',  // "none" : pas encore parlé
    })),
    hand: me ? [...me.hand] : [],
    playable: [],
    round: null,
    winners: game.winners,
    history: game.history.slice(-30),
  };
  if (r) {
    view.round = {
      number: r.number, dealer: r.dealer, cards_each: r.cards_each, bids: r.bids, high_bid: r.high_bid,
      taker: r.taker, trump: r.trump, trick: r.trick, last_trick: r.last_trick, tricks_played: r.tricks_played,
      belote: r.belote_said ? r.belote_holder : null, result: r.result,
    };
    if (me && game.phase === 'playing' && game.turn === meId) view.playable = legalCards(me.hand, r.trick, r.trump);
  }
  return view;
}
