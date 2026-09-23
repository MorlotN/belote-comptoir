// Tests du moteur : `node --test tests/` (ou bin/test).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as E from '../frontend/engine.js';

const T = (...pairs) => pairs.map(([player, card]) => ({ player, card, say: null }));

function table(n = 3, target = 10) {
  const { game } = E.newGame('ABCD', 'Nico');
  for (const name of ['Paul', 'Léa', 'Sam', 'Zoé', 'Max'].slice(0, n - 1)) E.join(game, name);
  game.target = target;
  return game;
}

const byName = (game, name) => game.players.find((p) => p.name === name);

function seatFirstDealer(game, seat = 0) {
  E.start(game, game.players[0]);
  game.dealer_seat = seat;
  E.beginRound(game);
}

// Force une donne : mains imposées, enchère gagnée par `taker`.
function rig(game, hands, taker, value, trump) {
  const dealer = E.player(game, game.turn);
  E.deal(game, dealer, Object.values(hands)[0].length);
  for (const [name, hand] of Object.entries(hands)) byName(game, name).hand = E.sortHand(hand, null);
  const r = game.round;
  r.high_bid = value;
  r.taker = byName(game, taker).id;
  game.phase = 'trump';
  game.turn = r.taker;
  E.chooseTrump(game, byName(game, taker), trump);
}

const playAll = (game, ...moves) => moves.forEach(([name, card]) => E.play(game, byName(game, name), card));

// ----- cartes -----

test('jeu de 32 cartes, 152 points hors dix de der', () => {
  assert.equal(new Set(E.DECK).size, 32);
  for (const trump of E.SUITS) assert.equal(E.DECK.reduce((s, c) => s + E.points(c, trump), 0), 152);
});

test("valet et neuf d'atout battent l'as", () => {
  assert.equal(E.trickWinner(T(['a', 'AH'], ['b', '9H'], ['c', 'JH']), 'H'), 'c');
  assert.equal(E.trickWinner(T(['a', 'AH'], ['b', '9H']), 'H'), 'b');
  assert.equal(E.trickWinner(T(['a', 'AH'], ['b', '10H']), 'S'), 'a');
});

test('la coupe bat la couleur, la défausse ne vaut rien', () => {
  assert.equal(E.trickWinner(T(['a', 'AH'], ['b', '7S']), 'S'), 'b');
  assert.equal(E.trickWinner(T(['a', '7H'], ['b', 'AC']), 'S'), 'a');
});

test('fournir, couper, monter', () => {
  assert.deepEqual(E.legalCards(['7H', 'AC', 'JS'], T(['a', 'KH']), 'S'), ['7H']);
  assert.deepEqual(E.legalCards(['7S', 'JS', 'AC'], T(['a', 'KH']), 'S').sort(), ['7S', 'JS']);
  assert.deepEqual(E.legalCards(['7S', 'JS', 'AC'], T(['a', 'KH'], ['b', '9S']), 'S'), ['JS']);
  // qui ne peut pas monter coupe quand même
  assert.deepEqual(E.legalCards(['7S', '8S', 'AC'], T(['a', 'KH'], ['b', 'JS']), 'S').sort(), ['7S', '8S']);
  assert.deepEqual(E.legalCards(['7S', 'JS', 'AH'], T(['a', '9S']), 'S'), ['JS']);
  assert.deepEqual(E.legalCards(['7S', '8S'], T(['a', '9S']), 'S').sort(), ['7S', '8S']);
  assert.deepEqual(E.legalCards(['7C', 'AD'], T(['a', 'KH']), 'S').sort(), ['7C', 'AD']);
});

// ----- table -----

test('pseudos en double numérotés, table pleine, partie commencée', () => {
  const game = table(2);
  assert.equal(E.join(game, 'nico').name, 'nico 2');
  const full = table(6);
  assert.throws(() => E.join(full, 'Septième'), E.GameError);
  const started = table(2);
  E.start(started, started.players[0]);
  assert.throws(() => E.join(started, 'Retard'), E.GameError);
});

test("seul l'hôte lance, il faut deux joueurs, l'hôte ne part pas", () => {
  const game = table(2);
  assert.throws(() => E.start(game, game.players[1]), E.GameError);
  assert.throws(() => E.removePlayer(game, game.players[0], game.players[0].id), E.GameError);
  E.removePlayer(game, game.players[1], game.players[1].id);
  assert.throws(() => E.start(game, game.players[0]), E.GameError);
});

// ----- manche -----

test('le donneur choisit le nombre de cartes', () => {
  const game = table(3);
  seatFirstDealer(game, 0);
  const [nico, paul] = game.players;
  assert.equal(game.phase, 'deal');
  assert.throws(() => E.deal(game, paul, 3), E.GameError);
  assert.throws(() => E.deal(game, nico, 6), E.GameError);
  E.deal(game, nico, 4);
  assert.ok(game.players.every((p) => p.hand.length === 4));
  assert.equal(new Set(game.players.flatMap((p) => p.hand)).size, 12);
  assert.equal(game.turn, paul.id);
});

test("enchères jusqu'à ce que tous les autres passent", () => {
  const game = table(3);
  seatFirstDealer(game, 0);
  const [nico, paul, lea] = game.players;
  E.deal(game, nico, 5);
  E.bid(game, paul, 20);
  assert.throws(() => E.bid(game, lea, 20), E.GameError);
  E.bid(game, lea, 25);
  E.bid(game, nico, null);
  assert.equal(game.turn, paul.id);
  E.bid(game, paul, 30);
  assert.equal(game.turn, lea.id);  // Nico a passé : il ne reparle plus
  E.bid(game, lea, null);
  assert.equal(game.phase, 'trump');
  assert.equal(game.turn, paul.id);
});

test('tout le monde passe : manche blanche, la donne tourne', () => {
  const game = table(3);
  seatFirstDealer(game, 0);
  const [nico, paul, lea] = game.players;
  E.deal(game, nico, 2);
  for (const p of [paul, lea, nico]) E.bid(game, p, null);
  assert.equal(game.phase, 'round_end');
  assert.ok(game.round.result.void);
  E.nextRound(game, paul);
  assert.equal(game.turn, paul.id);
});

test('le preneur qui tient marque un point', () => {
  const game = table(2);
  seatFirstDealer(game, 0);
  rig(game, { Nico: ['JS', 'AH'], Paul: ['7S', '7H'] }, 'Nico', 40, 'S');
  playAll(game, ['Nico', 'JS'], ['Paul', '7S'], ['Nico', 'AH'], ['Paul', '7H']);
  const res = game.round.result;
  assert.equal(res.points[game.players[0].id], 41);  // 20 + 11 + 10 de der
  assert.ok(res.made);
  assert.deepEqual(game.players.map((p) => p.score), [1, 0]);
});

test('le preneur qui chute donne un point à chacun des autres', () => {
  const game = table(3);
  seatFirstDealer(game, 0);
  rig(game, { Nico: ['7C'], Paul: ['AC'], Léa: ['8C'] }, 'Paul', 30, 'H');
  playAll(game, ['Paul', 'AC'], ['Léa', '8C'], ['Nico', '7C']);
  assert.equal(game.round.result.points[game.players[1].id], 21);
  assert.deepEqual(game.players.map((p) => p.score), [1, 0, 1]);
});

test('belote-rebelote compte vingt', () => {
  const game = table(2);
  seatFirstDealer(game, 0);
  rig(game, { Nico: ['KH', 'QH'], Paul: ['7C', '8C'] }, 'Nico', 45, 'H');
  E.play(game, byName(game, 'Nico'), 'KH');
  assert.equal(game.round.trick[0].say, 'Belote');
  playAll(game, ['Paul', '7C'], ['Nico', 'QH']);
  assert.equal(game.round.trick[0].say, 'Rebelote');
  playAll(game, ['Paul', '8C']);
  assert.equal(game.round.result.points[game.players[0].id], 37);  // 4 + 3 + 20 + 10
  assert.ok(!game.round.result.made);
});

test('options sans dix de der ni belote', () => {
  const game = table(2);
  game.dix_de_der = false;
  game.belote = false;
  seatFirstDealer(game, 0);
  rig(game, { Nico: ['KH', 'QH'], Paul: ['7C', '8C'] }, 'Nico', 7, 'H');
  playAll(game, ['Nico', 'KH'], ['Paul', '7C'], ['Nico', 'QH'], ['Paul', '8C']);
  assert.equal(game.round.result.points[game.players[0].id], 7);
  assert.ok(game.round.result.made);
});

test('carte interdite ou hors tour refusée', () => {
  const game = table(2);
  seatFirstDealer(game, 0);
  rig(game, { Nico: ['AH', '7C'], Paul: ['7H', 'AC'] }, 'Nico', 1, 'S');
  E.play(game, byName(game, 'Nico'), 'AH');
  assert.throws(() => E.play(game, byName(game, 'Paul'), 'AC'), E.GameError);
  assert.throws(() => E.play(game, byName(game, 'Nico'), '7C'), E.GameError);
});

test('victoire seul en tête, sinon on continue', () => {
  const game = table(3, 3);
  seatFirstDealer(game, 0);
  const [nico, paul, lea] = game.players;
  [nico.score, paul.score, lea.score] = [2, 2, 1];
  rig(game, { Nico: ['7C'], Paul: ['8C'], Léa: ['AC'] }, 'Léa', 100, 'H');
  playAll(game, ['Léa', 'AC'], ['Nico', '7C'], ['Paul', '8C']);
  assert.equal(game.phase, 'round_end');
  assert.ok(game.round.result.tie);
  E.nextRound(game, nico);
  rig(game, { Nico: ['AD'], Paul: ['7D'], Léa: ['8D'] }, 'Nico', 1, 'S');
  playAll(game, ['Nico', 'AD'], ['Paul', '7D'], ['Léa', '8D']);
  assert.equal(game.phase, 'finished');
  assert.deepEqual(game.winners, [nico.id]);
  E.replay(game, nico);
  assert.equal(game.phase, 'lobby');
});

test('jouer pour un absent', () => {
  const game = table(3);
  seatFirstDealer(game, 0);
  const [nico, paul, lea] = game.players;
  E.deal(game, nico, 3);
  paul.connected = true;
  assert.throws(() => E.standIn(game, nico), E.GameError);
  E.bid(game, paul, 10);
  E.standIn(game, nico);  // Léa absente : elle passe
  assert.ok(lea.passed);
  assert.equal(game.turn, nico.id);
});

test('la vue ne montre jamais la main des autres', () => {
  const game = table(3);
  seatFirstDealer(game, 0);
  E.deal(game, game.players[0], 5);
  const view = E.buildView(game, game.players[1].id);
  assert.deepEqual(view.hand, game.players[1].hand);
  assert.ok(view.players.every((p) => !('hand' in p) && !('token' in p)));
  assert.ok(!JSON.stringify(view).includes(game.players[0].token));
});

test('une partie survit à JSON (sauvegarde du téléphone hôte)', () => {
  const game = table(3);
  seatFirstDealer(game, 0);
  E.deal(game, game.players[0], 3);
  const copy = JSON.parse(JSON.stringify(game));
  E.bid(copy, E.player(copy, copy.turn), 5);
  assert.equal(copy.round.high_bid, 5);
});

// Des joueurs qui jouent n'importe quelle carte permise : la partie doit finir, sans carte
// perdue ni dupliquée, avec un seul vainqueur.
function seeded(seed) {
  let s = seed + 1;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

for (let seed = 0; seed < 60; seed += 1) {
  test(`partie au hasard n°${seed}`, () => {
    const rnd = seeded(seed);
    const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
    const game = table(2 + Math.floor(rnd() * 5), pick(E.TARGETS));
    E.apply(game, game.players[0], { type: 'start' });
    for (let i = 0; i < 3000 && game.phase !== 'finished'; i += 1) {
      const actor = E.player(game, game.turn) || game.players[0];
      const r = game.round;
      if (game.phase === 'deal') E.apply(game, actor, { type: 'deal', cards: 1 + Math.floor(rnd() * E.maxCards(game)) });
      else if (game.phase === 'bidding') E.apply(game, actor, { type: 'bid', value: rnd() < 0.5 ? null : r.high_bid + 1 + Math.floor(rnd() * 15) });
      else if (game.phase === 'trump') E.apply(game, actor, { type: 'trump', suit: pick(E.SUITS) });
      else if (game.phase === 'playing') {
        if (rnd() < 0.2) E.autoPlay(game, actor);
        else E.apply(game, actor, { type: 'play', card: pick(E.legalCards(actor.hand, r.trick, r.trump)) });
        if (game.phase === 'playing') {
          const seen = [...game.players.flatMap((p) => [...p.hand, ...p.won]), ...game.round.trick.map((t) => t.card)];
          assert.equal(new Set(seen).size, seen.length);
          assert.equal(seen.length, game.round.cards_each * game.players.length);
        }
      } else if (game.phase === 'round_end') E.apply(game, game.players[0], { type: 'next', round: r.number });
    }
    assert.equal(game.phase, 'finished');
    const top = Math.max(...game.players.map((p) => p.score));
    assert.ok(top >= game.target);
    assert.deepEqual(game.players.filter((p) => p.score === top).map((p) => p.id), game.winners);
  });
}
