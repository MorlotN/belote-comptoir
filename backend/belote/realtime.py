"""Parties en mémoire, diffusion par WebSocket, un verrou par partie.

`Tables.mutate` est le seul chemin pour modifier une partie : il prend le verrou,
applique l'action, puis pousse à chaque joueur connecté sa propre vue.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from collections import defaultdict
from typing import Callable

from fastapi import WebSocket

from .engine import Game, GameError, Player
from .views import build_view

log = logging.getLogger("belote.realtime")

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ"  # sans I, L, O : un code se dicte au comptoir


class Tables:
    def __init__(self, max_games: int = 300, ttl_seconds: float = 12 * 3600) -> None:
        self.games: dict[str, Game] = {}
        self.touched: dict[str, float] = {}
        self.max_games = max_games
        self.ttl = ttl_seconds
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._conns: dict[str, dict[str, set[WebSocket]]] = defaultdict(lambda: defaultdict(set))

    # ----- accès -----

    def get(self, code: str) -> Game:
        game = self.games.get((code or "").upper())
        if game is None:
            raise GameError("Table introuvable : vérifie le code", 404)
        return game

    def auth(self, game: Game, token: str | None) -> Player:
        player = game.player_by_token(token or "")
        if player is None:
            raise GameError("Tu n'es pas assis à cette table", 401)
        return player

    def new_code(self) -> str:
        for _ in range(100):
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(4))
            if code not in self.games:
                return code
        raise GameError("Plus de code libre, réessaie", 503)

    def add(self, game: Game) -> None:
        self.cleanup()
        if len(self.games) >= self.max_games:
            raise GameError("Trop de tables ouvertes sur ce serveur, réessaie dans quelques minutes", 503)
        self.games[game.code] = game
        self.touched[game.code] = time.time()

    # ----- mutations -----

    async def mutate(self, code: str, fn: Callable[[Game], object]) -> Game:
        code = code.upper()
        async with self._locks[code]:
            game = self.get(code)
            fn(game)
            game.version += 1
            self.touched[code] = time.time()
            if not game.players:
                self.drop(code)
                return game
            await self.broadcast(game)
            return game

    async def set_connected(self, code: str, player_id: str, connected: bool) -> bool:
        """Renvoie vrai si l'état a changé, donc si tout le monde a reçu la nouvelle vue."""
        async with self._locks[code]:
            game = self.games.get(code)
            player = game.player(player_id) if game else None
            if player is None or player.connected == connected:
                return False
            player.connected = connected
            game.version += 1
            await self.broadcast(game)
            return True

    # ----- connexions -----

    def connect(self, code: str, player_id: str, ws: WebSocket) -> None:
        self._conns[code][player_id].add(ws)

    def disconnect(self, code: str, player_id: str, ws: WebSocket) -> bool:
        """Retire une connexion ; renvoie vrai s'il en reste une pour ce joueur."""
        conns = self._conns.get(code, {}).get(player_id)
        if conns:
            conns.discard(ws)
        return bool(conns)

    async def broadcast(self, game: Game) -> None:
        per_player = self._conns.get(game.code)
        if not per_player:
            return
        for player_id in list(per_player):
            if game.player(player_id) is None:  # retiré de la table
                for ws in list(per_player.pop(player_id, ())):
                    try:
                        await ws.send_json({"type": "error", "detail": "Tu n'es plus à cette table"})
                        await ws.close(code=4403)
                    except Exception:
                        pass
        for player in game.players:
            sockets = per_player.get(player.id)
            if not sockets:
                continue
            payload = {"type": "state", "state": build_view(game, player)}
            for ws in list(sockets):
                try:
                    await ws.send_json(payload)
                except Exception:  # connexion morte : le handler WS fera le ménage
                    sockets.discard(ws)

    # ----- ménage -----

    def drop(self, code: str) -> None:
        self.games.pop(code, None)
        self.touched.pop(code, None)
        self._locks.pop(code, None)
        self._conns.pop(code, None)

    def cleanup(self) -> list[str]:
        now = time.time()
        stale = [c for c, t in self.touched.items() if now - t > self.ttl]
        for code in stale:
            self.drop(code)
        return stale

    async def cleanup_loop(self, every: float = 600) -> None:
        while True:
            try:
                self.cleanup()
            except Exception:  # pragma: no cover
                log.exception("nettoyage")
            await asyncio.sleep(every)
