"""Ce que chaque joueur voit de la partie : sa main, jamais celle des autres."""

from __future__ import annotations

from . import engine
from .engine import Game, Player


def build_view(game: Game, me: Player) -> dict:
    r = game.round
    last_bid: dict[str, int | None] = {}
    if r:
        for pid, value in r.bids:
            last_bid[pid] = value
    players = [
        {
            "id": p.id,
            "name": p.name,
            "score": p.score,
            "connected": p.connected,
            "cards": len(p.hand),
            "tricks": p.tricks,
            "host": p.id == game.host,
            "dealer": bool(r and r.dealer == p.id),
            "passed": p.passed,
            "bid": last_bid.get(p.id, "none") if r else "none",  # "none" : pas encore parlé
        }
        for p in game.players
    ]
    view = {
        "code": game.code,
        "version": game.version,
        "phase": game.phase,
        "me": me.id,
        "host": game.host,
        "turn": game.turn,
        "target": game.target,
        "options": {"dix_de_der": game.dix_de_der, "belote": game.belote},
        "targets": list(engine.TARGETS),
        "limits": {"min_players": engine.MIN_PLAYERS, "max_players": engine.MAX_PLAYERS,
                   "max_cards": engine.max_cards(game), "max_bid": engine.MAX_BID},
        "players": players,
        "hand": list(me.hand),
        "playable": [],
        "round": None,
        "winners": game.winners,
        "history": game.history[-30:],
    }
    if r:
        view["round"] = {
            "number": r.number,
            "dealer": r.dealer,
            "cards_each": r.cards_each,
            "bids": [{"player": pid, "value": v} for pid, v in r.bids],
            "high_bid": r.high_bid,
            "taker": r.taker,
            "trump": r.trump,
            "trick": r.trick,
            "last_trick": r.last_trick,
            "tricks_played": r.tricks_played,
            "belote": r.belote_holder if r.belote_said else None,
            "result": r.result,
        }
        if game.phase == "playing" and game.turn == me.id:
            view["playable"] = engine.legal_cards(me.hand, r.trick, r.trump)
    return view
