import pytest
from fastapi.testclient import TestClient

from belote.app import create_app


@pytest.fixture
def client():
    with TestClient(create_app()) as c:
        yield c


def act(client, code, token, **body):
    return client.post(f"/api/games/{code}/action", json=body, headers={"X-Player-Token": token})


def test_ouvrir_rejoindre_jouer_une_manche(client):
    r = client.post("/api/games", json={"name": "Nico"})
    assert r.status_code == 200
    code, host = r.json()["code"], r.json()["token"]
    r = client.post(f"/api/games/{code.lower()}/join", json={"name": "Paul"})
    assert r.status_code == 200
    paul = r.json()["token"]
    tokens = {r.json()["player_id"]: paul, client.get(f"/api/games/{code}", headers={"X-Player-Token": host}).json()["me"]: host}

    assert act(client, code, paul, type="start").status_code == 403
    state = act(client, code, host, type="start").json()
    assert state["phase"] == "deal"

    dealer = tokens[state["turn"]]
    state = act(client, code, dealer, type="deal", cards=3).json()
    assert state["phase"] == "bidding"
    assert len(state["hand"]) == 3
    assert all("hand" not in p for p in state["players"])  # jamais la main des autres

    first = tokens[state["turn"]]
    other = dealer
    r = act(client, code, other, type="bid", value=5)
    assert r.status_code == 409 and "tour" in r.json()["detail"]
    act(client, code, first, type="bid", value=5)
    state = act(client, code, other, type="bid").json()  # passe
    assert state["phase"] == "trump"
    state = act(client, code, first, type="trump", suit="H").json()
    assert state["phase"] == "playing" and state["playable"]

    for _ in range(6):
        state = client.get(f"/api/games/{code}", headers={"X-Player-Token": tokens[state["turn"]]}).json()
        state = act(client, code, tokens[state["me"]], type="play", card=state["playable"][0]).json()
    assert state["phase"] in ("round_end", "finished")
    assert state["round"]["result"]["taker"]


def test_websocket_pousse_l_etat(client):
    r = client.post("/api/games", json={"name": "Nico"}).json()
    code, host = r["code"], r["token"]
    with client.websocket_connect(f"/ws/{code}?token={host}") as ws:
        first = ws.receive_json()
        assert first["type"] == "state" and first["state"]["players"][0]["connected"]
        client.post(f"/api/games/{code}/join", json={"name": "Paul"})
        msg = ws.receive_json()
        assert [p["name"] for p in msg["state"]["players"]] == ["Nico", "Paul"]
        ws.send_json({"type": "ping"})
        assert ws.receive_json()["type"] == "pong"


def test_jeton_ou_table_inconnus(client):
    assert client.get("/api/games/ZZZZ", headers={"X-Player-Token": "x"}).status_code == 404
    code = client.post("/api/games", json={"name": "Nico"}).json()["code"]
    assert client.get(f"/api/games/{code}", headers={"X-Player-Token": "faux"}).status_code == 401
    with client.websocket_connect(f"/ws/{code}?token=faux") as ws:
        assert ws.receive_json()["type"] == "error"


def test_quitter_la_derniere_place_ferme_la_table(client):
    r = client.post("/api/games", json={"name": "Nico"}).json()
    assert act(client, r["code"], r["token"], type="remove").json() == {"left": True}
    assert client.get(f"/api/games/{r['code']}", headers={"X-Player-Token": r["token"]}).status_code == 404


def test_frontend_servi(client):
    r = client.get("/")
    assert r.status_code == 200 and "Belote" in r.text
