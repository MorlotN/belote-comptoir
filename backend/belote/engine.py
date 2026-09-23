"""Règles de la belote de comptoir : distribution, enchères, atout, plis, comptage.

Le moteur est pur : ni réseau ni horloge. Chaque action vérifie qui la joue et à quel
moment, puis modifie la partie ou lève `GameError`. La règle suivie est décrite dans
`docs/regles.md`.
"""

from __future__ import annotations

import random
import secrets
from dataclasses import dataclass, field
from typing import Iterator

SUITS = ("S", "H", "C", "D")  # pique, cœur, trèfle, carreau : couleurs alternées à l'affichage
RANKS = ("7", "8", "9", "10", "J", "Q", "K", "A")
DECK = tuple(r + s for s in SUITS for r in RANKS)

TRUMP_ORDER = ("7", "8", "Q", "K", "10", "A", "9", "J")
PLAIN_ORDER = ("7", "8", "9", "J", "Q", "K", "10", "A")
TRUMP_POINTS = {"J": 20, "9": 14, "A": 11, "10": 10, "K": 4, "Q": 3, "8": 0, "7": 0}
PLAIN_POINTS = {"A": 11, "10": 10, "K": 4, "Q": 3, "J": 2, "9": 0, "8": 0, "7": 0}

MIN_PLAYERS, MAX_PLAYERS = 2, 6
MAX_CARDS = 5
DIX_DE_DER = 10
BELOTE = 20
MAX_BID = 152 + DIX_DE_DER + BELOTE  # au-delà, même en ramassant tout on ne tient pas
TARGETS = (3, 5, 10, 15, 20)
NAME_MAX = 20

_rng = random.SystemRandom()


class GameError(Exception):
    def __init__(self, detail: str, status: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status = status


# ----- cartes -----

def rank(card: str) -> str:
    return card[:-1]


def suit(card: str) -> str:
    return card[-1]


def points(card: str, trump: str | None) -> int:
    return (TRUMP_POINTS if suit(card) == trump else PLAIN_POINTS)[rank(card)]


def strength(card: str, trump: str | None, led: str) -> int:
    """Force d'une carte dans un pli : un atout bat tout, puis la couleur demandée, le reste ne vaut rien."""
    if suit(card) == trump:
        return 100 + TRUMP_ORDER.index(rank(card))
    if suit(card) == led:
        return 10 + PLAIN_ORDER.index(rank(card))
    return 0


def trick_winner(trick: list[dict], trump: str | None) -> str:
    led = suit(trick[0]["card"])
    return max(trick, key=lambda t: strength(t["card"], trump, led))["player"]


def legal_cards(hand: list[str], trick: list[dict], trump: str | None) -> list[str]:
    """Obligations de la belote classique, chacun pour soi : fournir, sinon couper,
    et monter à l'atout dès qu'on le peut. Qui ne peut pas monter coupe quand même."""
    if not trick:
        return list(hand)
    led = suit(trick[0]["card"])
    follow = [c for c in hand if suit(c) == led]
    trumps = [c for c in hand if suit(c) == trump]
    played_trumps = [TRUMP_ORDER.index(rank(t["card"])) for t in trick if suit(t["card"]) == trump]
    best = max(played_trumps, default=-1)

    def over(cards: list[str]) -> list[str]:
        return [c for c in cards if TRUMP_ORDER.index(rank(c)) > best]

    if led == trump:
        if follow:
            return over(follow) or follow
        return list(hand)
    if follow:
        return follow
    if trumps:
        return over(trumps) or trumps
    return list(hand)


def sort_hand(hand: list[str], trump: str | None) -> list[str]:
    def key(c: str) -> tuple[int, int]:
        order = TRUMP_ORDER if suit(c) == trump else PLAIN_ORDER
        return SUITS.index(suit(c)), order.index(rank(c))
    return sorted(hand, key=key)


# ----- modèle -----

@dataclass
class Player:
    id: str
    token: str
    name: str
    score: int = 0
    connected: bool = False
    hand: list[str] = field(default_factory=list)
    won: list[str] = field(default_factory=list)  # cartes ramassées pendant la manche
    tricks: int = 0
    passed: bool = False


@dataclass
class Round:
    number: int
    dealer: str
    cards_each: int = 0
    bids: list[tuple[str, int | None]] = field(default_factory=list)  # None : le joueur passe
    high_bid: int = 0
    taker: str | None = None  # meilleur enchérisseur, puis preneur
    trump: str | None = None
    trick: list[dict] = field(default_factory=list)  # {"player", "card", "say"}
    last_trick: dict | None = None  # {"cards": [...], "winner": id}
    tricks_played: int = 0
    belote_holder: str | None = None
    belote_said: int = 0
    result: dict | None = None


@dataclass
class Game:
    code: str
    host: str = ""
    players: list[Player] = field(default_factory=list)
    phase: str = "lobby"  # lobby, deal, bidding, trump, playing, round_end, finished
    target: int = 10
    dix_de_der: bool = True
    belote: bool = True
    round: Round | None = None
    rounds_played: int = 0
    dealer_seat: int = 0
    turn: str | None = None
    winners: list[str] = field(default_factory=list)
    history: list[dict] = field(default_factory=list)
    version: int = 0  # augmente à chaque changement : le téléphone garde l'état le plus récent

    def player(self, player_id: str | None) -> Player | None:
        return next((p for p in self.players if p.id == player_id), None)

    def player_by_token(self, token: str) -> Player | None:
        if not token:
            return None
        return next((p for p in self.players if secrets.compare_digest(p.token, token)), None)

    def seat(self, player_id: str) -> int:
        return next(i for i, p in enumerate(self.players) if p.id == player_id)

    def after(self, player_id: str) -> Iterator[Player]:
        """Les joueurs qui suivent `player_id` dans l'ordre du jeu, lui compris en dernier."""
        i = self.seat(player_id)
        n = len(self.players)
        for k in range(1, n + 1):
            yield self.players[(i + k) % n]


def _new_player(name: str) -> Player:
    return Player(id=secrets.token_hex(4), token=secrets.token_urlsafe(18), name=name)


def clean_name(game: Game | None, name: str) -> str:
    name = " ".join((name or "").split())[:NAME_MAX]
    if not name:
        raise GameError("Choisis un pseudo")
    if game is not None:
        taken = {p.name.lower() for p in game.players}
        base, n = name, 2
        while name.lower() in taken:
            name = f"{base[:NAME_MAX - 3]} {n}"
            n += 1
    return name


def new_game(code: str, host_name: str) -> tuple[Game, Player]:
    game = Game(code=code)
    host = _new_player(clean_name(None, host_name))
    game.players.append(host)
    game.host = host.id
    return game, host


def join(game: Game, name: str) -> Player:
    if game.phase != "lobby":
        raise GameError("La partie a déjà commencé", 409)
    if len(game.players) >= MAX_PLAYERS:
        raise GameError(f"La table est pleine ({MAX_PLAYERS} joueurs)", 409)
    player = _new_player(clean_name(game, name))
    game.players.append(player)
    return player


# ----- actions -----

def _require(cond: bool, detail: str, status: int = 409) -> None:
    if not cond:
        raise GameError(detail, status)


def _require_turn(game: Game, actor: Player, phase: str) -> None:
    _require(game.phase == phase, "Ce n'est pas le moment")
    _require(game.turn == actor.id, "Ce n'est pas ton tour")


def set_options(game: Game, actor: Player, target=None, dix_de_der=None, belote=None) -> None:
    _require(actor.id == game.host, "Seul l'hôte règle la partie", 403)
    _require(game.phase == "lobby", "La partie a déjà commencé")
    if target is not None:
        _require(target in TARGETS, "Objectif inconnu", 400)
        game.target = target
    if dix_de_der is not None:
        game.dix_de_der = bool(dix_de_der)
    if belote is not None:
        game.belote = bool(belote)


def remove_player(game: Game, actor: Player, target_id: str) -> None:
    _require(game.phase == "lobby", "On ne quitte pas une partie en cours")
    target = game.player(target_id)
    _require(target is not None, "Joueur inconnu", 404)
    _require(actor.id == target_id or actor.id == game.host, "Seul l'hôte peut retirer un joueur", 403)
    game.players.remove(target)
    if target.id == game.host and game.players:
        game.host = game.players[0].id


def start(game: Game, actor: Player) -> None:
    _require(actor.id == game.host, "Seul l'hôte lance la partie", 403)
    _require(game.phase == "lobby", "La partie a déjà commencé")
    _require(len(game.players) >= MIN_PLAYERS, f"Il faut au moins {MIN_PLAYERS} joueurs")
    for p in game.players:
        p.score = 0
    game.winners = []
    game.history = []
    game.rounds_played = 0
    game.dealer_seat = _rng.randrange(len(game.players))
    _begin_round(game)


def _begin_round(game: Game) -> None:
    dealer = game.players[game.dealer_seat % len(game.players)]
    for p in game.players:
        p.hand, p.won, p.tricks, p.passed = [], [], 0, False
    game.round = Round(number=game.rounds_played + 1, dealer=dealer.id)
    game.phase = "deal"
    game.turn = dealer.id


def max_cards(game: Game) -> int:
    return min(MAX_CARDS, len(DECK) // max(1, len(game.players)))


def deal(game: Game, actor: Player, cards: int) -> None:
    _require_turn(game, actor, "deal")
    _require(isinstance(cards, int) and 1 <= cards <= max_cards(game), f"Entre 1 et {max_cards(game)} cartes", 400)
    deck = list(DECK)
    _rng.shuffle(deck)
    # le donneur sert en commençant par le joueur qui le suit, comme à la table
    order = list(game.after(actor.id))
    for i, p in enumerate(order):
        p.hand = sort_hand(deck[i * cards:(i + 1) * cards], None)
    r = game.round
    r.cards_each = cards
    game.phase = "bidding"
    game.turn = order[0].id


def bid(game: Game, actor: Player, value: int | None) -> None:
    _require_turn(game, actor, "bidding")
    r = game.round
    if value is None:
        actor.passed = True
    else:
        _require(isinstance(value, int) and not isinstance(value, bool), "Annonce invalide", 400)
        _require(value > r.high_bid, f"Il faut annoncer plus de {r.high_bid}", 400)
        _require(1 <= value <= MAX_BID, f"Une annonce va de 1 à {MAX_BID}", 400)
        r.high_bid = value
        r.taker = actor.id
    r.bids.append((actor.id, value))
    nxt = next((p for p in game.after(actor.id) if not p.passed), None)
    if nxt is None:
        _void_round(game)
    elif nxt.id == r.taker:
        game.phase = "trump"
        game.turn = r.taker
    else:
        game.turn = nxt.id


def choose_trump(game: Game, actor: Player, trump: str) -> None:
    _require_turn(game, actor, "trump")
    _require(trump in SUITS, "Couleur inconnue", 400)
    r = game.round
    r.trump = trump
    for p in game.players:
        p.hand = sort_hand(p.hand, trump)
        if game.belote and {"K" + trump, "Q" + trump} <= set(p.hand):
            r.belote_holder = p.id
    game.phase = "playing"
    game.turn = actor.id  # le preneur entame


def play(game: Game, actor: Player, card: str) -> None:
    _require_turn(game, actor, "playing")
    r = game.round
    _require(card in actor.hand, "Tu n'as pas cette carte", 400)
    _require(card in legal_cards(actor.hand, r.trick, r.trump), "Carte interdite : il faut fournir, couper ou monter", 400)
    actor.hand.remove(card)
    say = None
    if actor.id == r.belote_holder and card in ("K" + r.trump, "Q" + r.trump):
        r.belote_said += 1
        say = "Belote" if r.belote_said == 1 else "Rebelote"
    r.trick.append({"player": actor.id, "card": card, "say": say})
    if len(r.trick) < len(game.players):
        game.turn = next(game.after(actor.id)).id
        return
    winner = game.player(trick_winner(r.trick, r.trump))
    winner.won.extend(t["card"] for t in r.trick)
    winner.tricks += 1
    r.tricks_played += 1
    r.last_trick = {"cards": r.trick, "winner": winner.id, "number": r.tricks_played}
    r.trick = []
    if r.tricks_played < r.cards_each:
        game.turn = winner.id
    else:
        _finish_round(game, last=winner.id)


def round_points(game: Game, last: str | None) -> dict[str, int]:
    r = game.round
    pts = {p.id: sum(points(c, r.trump) for c in p.won) for p in game.players}
    if game.dix_de_der and last:
        pts[last] += DIX_DE_DER
    if r.belote_holder:
        pts[r.belote_holder] += BELOTE
    return pts


def _finish_round(game: Game, last: str) -> None:
    r = game.round
    pts = round_points(game, last)
    made = pts[r.taker] >= r.high_bid
    gained = [r.taker] if made else [p.id for p in game.players if p.id != r.taker]
    for p in game.players:
        if p.id in gained:
            p.score += 1
    r.result = {
        "void": False, "taker": r.taker, "bid": r.high_bid, "trump": r.trump, "made": made,
        "points": pts, "tricks": {p.id: p.tricks for p in game.players},
        "last": last if game.dix_de_der else None, "belote": r.belote_holder, "gained": gained,
    }
    _close_round(game)


def _void_round(game: Game) -> None:
    game.round.result = {"void": True, "gained": []}
    _close_round(game)


def _close_round(game: Game) -> None:
    r = game.round
    game.rounds_played += 1
    game.history.append({"number": r.number, "dealer": r.dealer, "cards": r.cards_each, **r.result})
    game.turn = None
    top = max(p.score for p in game.players)
    leaders = [p.id for p in game.players if p.score == top]
    r.result["tie"] = top >= game.target and len(leaders) > 1
    if top >= game.target and len(leaders) == 1:
        game.phase = "finished"
        game.winners = leaders
    else:
        game.phase = "round_end"


def next_round(game: Game, actor: Player, number: int | None = None) -> None:
    _require(game.phase == "round_end", "La manche n'est pas finie")
    if number is not None:
        _require(number == game.round.number, "Déjà relancé")
    game.dealer_seat = (game.seat(game.round.dealer) + 1) % len(game.players)
    _begin_round(game)


def replay(game: Game, actor: Player) -> None:
    _require(actor.id == game.host, "Seul l'hôte relance", 403)
    _require(game.phase == "finished", "La partie n'est pas finie")
    game.phase = "lobby"
    game.round = None
    game.turn = None
    for p in game.players:
        p.hand, p.won, p.tricks, p.passed = [], [], 0, False


def stand_in(game: Game, actor: Player) -> None:
    """L'hôte fait jouer le joueur dont c'est le tour quand son téléphone a décroché :
    il passe, sert 5 cartes, prend sa plus longue couleur, joue sa plus petite carte permise."""
    _require(actor.id == game.host, "Seul l'hôte peut jouer pour un absent", 403)
    target = game.player(game.turn)
    _require(target is not None and target.id != actor.id, "Personne à remplacer")
    _require(not target.connected, f"{target.name} est connecté, c'est à lui de jouer")
    if game.phase == "deal":
        deal(game, target, max_cards(game))
    elif game.phase == "bidding":
        bid(game, target, None)
    elif game.phase == "trump":
        count = {s: sum(1 for c in target.hand if suit(c) == s) for s in SUITS}
        choose_trump(game, target, max(SUITS, key=lambda s: count[s]))
    elif game.phase == "playing":
        r = game.round
        legal = legal_cards(target.hand, r.trick, r.trump)
        led = suit(r.trick[0]["card"]) if r.trick else None
        play(game, target, min(legal, key=lambda c: (points(c, r.trump), strength(c, r.trump, led or suit(c)))))
    else:
        raise GameError("Ce n'est pas le moment")


ACTIONS = {
    "options": lambda g, p, a: set_options(g, p, a.get("target"), a.get("dix_de_der"), a.get("belote")),
    "remove": lambda g, p, a: remove_player(g, p, a.get("player_id") or p.id),
    "start": lambda g, p, a: start(g, p),
    "deal": lambda g, p, a: deal(g, p, a.get("cards")),
    "bid": lambda g, p, a: bid(g, p, a.get("value")),
    "trump": lambda g, p, a: choose_trump(g, p, a.get("suit")),
    "play": lambda g, p, a: play(g, p, a.get("card")),
    "next": lambda g, p, a: next_round(g, p, a.get("round")),
    "replay": lambda g, p, a: replay(g, p),
    "stand_in": lambda g, p, a: stand_in(g, p),
}


def apply(game: Game, actor: Player, action: dict) -> None:
    fn = ACTIONS.get(action.get("type"))
    if fn is None:
        raise GameError("Action inconnue", 400)
    fn(game, actor, action)
