"""Application FastAPI : ouvrir et rejoindre une table, jouer, WebSocket, fichiers du frontend."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Header, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import engine
from .engine import GameError
from .realtime import Tables
from .views import build_view

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = Path(os.environ.get("BELOTE_FRONTEND_DIR", ROOT / "frontend"))
MAX_GAMES = int(os.environ.get("BELOTE_MAX_GAMES", "300"))
CREATE_PER_MIN = int(os.environ.get("BELOTE_CREATE_PER_MIN", "10"))
JOIN_PER_MIN = int(os.environ.get("BELOTE_JOIN_PER_MIN", "30"))

log = logging.getLogger("belote")


class NameBody(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class ActionBody(BaseModel):
    type: Literal["options", "remove", "start", "deal", "bid", "trump", "play", "next", "replay", "stand_in"]
    cards: int | None = None
    value: int | None = None
    suit: str | None = Field(default=None, max_length=2)
    card: str | None = Field(default=None, max_length=4)
    round: int | None = None
    player_id: str | None = Field(default=None, max_length=16)
    target: int | None = None
    dix_de_der: bool | None = None
    belote: bool | None = None


class RateLimiter:
    """Fenêtre glissante : au plus `per_minute` appels par adresse sur une minute."""

    def __init__(self, per_minute: int) -> None:
        self.max = per_minute
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= self.max:
            raise GameError("Doucement : trop d'essais, attends une minute", 429)
        q.append(now)


def client_ip(request: Request) -> str:
    h = request.headers
    forwarded = (h.get("x-forwarded-for") or "").split(",")[0].strip()
    return h.get("cf-connecting-ip") or forwarded or (request.client.host if request.client else "?")


def create_app(max_games: int = MAX_GAMES) -> FastAPI:
    logging.basicConfig(level=os.environ.get("BELOTE_LOG_LEVEL", "info").upper())
    tables = Tables(max_games=max_games)
    create_limit = RateLimiter(CREATE_PER_MIN)
    join_limit = RateLimiter(JOIN_PER_MIN)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        cleaner = asyncio.create_task(tables.cleanup_loop())
        try:
            yield
        finally:
            cleaner.cancel()

    app = FastAPI(title="Belote de comptoir", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.tables = tables

    @app.exception_handler(GameError)
    async def game_error(_: Request, exc: GameError):
        return JSONResponse(status_code=exc.status, content={"detail": exc.detail})

    @app.get("/api/health")
    async def health():
        return {"ok": True, "tables": len(tables.games)}

    @app.post("/api/games")
    async def create_game(body: NameBody, request: Request):
        create_limit.check(client_ip(request))
        game, host = engine.new_game(tables.new_code(), body.name)
        tables.add(game)
        return {"code": game.code, "token": host.token, "player_id": host.id, "state": build_view(game, host)}

    @app.post("/api/games/{code}/join")
    async def join_game(code: str, body: NameBody, request: Request):
        join_limit.check(client_ip(request))
        box: dict = {}
        game = await tables.mutate(code, lambda g: box.update(player=engine.join(g, body.name)))
        player = box["player"]
        return {"code": game.code, "token": player.token, "player_id": player.id, "state": build_view(game, player)}

    @app.get("/api/games/{code}")
    async def get_state(code: str, x_player_token: str | None = Header(default=None)):
        game = tables.get(code)
        return build_view(game, tables.auth(game, x_player_token))

    @app.post("/api/games/{code}/action")
    async def act(code: str, body: ActionBody, x_player_token: str | None = Header(default=None)):
        action = body.model_dump(exclude_none=True)
        box: dict = {}

        def run(game):
            player = tables.auth(game, x_player_token)
            box["player"] = player
            engine.apply(game, player, action)

        game = await tables.mutate(code, run)
        player = box["player"]
        if game.player(player.id) is None:  # il vient de quitter la table
            return {"left": True}
        return build_view(game, player)

    @app.websocket("/ws/{code}")
    async def socket(ws: WebSocket, code: str, token: str = ""):
        code = code.upper()
        game = tables.games.get(code)
        player = game.player_by_token(token) if game else None
        await ws.accept()
        if game is None or player is None:
            await ws.send_json({"type": "error", "detail": "Table ou place inconnue"})
            await ws.close(code=4401)
            return
        tables.connect(code, player.id, ws)
        try:
            if not await tables.set_connected(code, player.id, True):  # déjà connecté ailleurs : pas de diffusion
                game = tables.games.get(code)
                if game is not None and game.player(player.id):
                    await ws.send_json({"type": "state", "state": build_view(game, player)})
            while True:
                msg = await ws.receive_json()
                if isinstance(msg, dict) and msg.get("type") == "ping":
                    await ws.send_json({"type": "pong"})
        except WebSocketDisconnect:
            pass
        except Exception as e:  # message mal formé, socket cassée...
            log.debug("ws %s/%s fermée : %s", code, player.id, e)
        finally:
            if not tables.disconnect(code, player.id, ws):
                await tables.set_connected(code, player.id, False)

    @app.middleware("http")
    async def no_stale_frontend(request: Request, call_next):
        """Les fichiers changent à chaque livraison : le téléphone doit toujours revalider."""
        response = await call_next(request)
        if not request.url.path.startswith(("/api", "/vendor/")):
            response.headers["Cache-Control"] = "no-cache"
        return response

    if FRONTEND.is_dir():
        app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
    return app


app = create_app()
