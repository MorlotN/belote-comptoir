# Belote de comptoir

La belote des bistrots, en ligne : de 2 à 6 joueurs, chacun sur son téléphone. Un
joueur ouvre une table, les autres scannent le QR ou tapent le code à 4 lettres.
Le donneur choisit de 1 à 5 cartes, chacun annonce les points qu'il pense faire, le
preneur choisit l'atout. 1 point s'il tient, sinon 1 point à chacun des autres ;
premier à 10. Règle détaillée et choix faits : `docs/regles.md`.

## Pile

- `backend/belote/engine.py` : la règle, pure (ni réseau ni horloge)
- `backend/belote/views.py` : ce que voit chaque joueur (jamais la main des autres)
- `backend/belote/realtime.py` : tables en mémoire, un verrou par table, diffusion WebSocket
- `backend/belote/app.py` : FastAPI (`POST /api/games`, `/join`, `/action`, `WS /ws/{code}`)
- `frontend/` : Preact + htm sans étape de construction (même principe que le blindtest)

Les tables vivent en mémoire : un redémarrage du serveur les efface. Une table sans
activité depuis 12 h est supprimée.

## Lancer

```
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
bin/dev            # http://localhost:8010
bin/test           # moteur + API, sans réseau
bin/e2e            # une partie complète à 3 navigateurs (Chrome système)
BELOTE_SHOTS=/tmp/captures bin/e2e   # idem, avec captures d'écran
```

En production : `docker compose up -d --build` (port 8010, lié à 127.0.0.1 pour un
tunnel Cloudflare).

## Réglages (variables d'environnement)

| Variable | Défaut | Rôle |
|---|---|---|
| `BELOTE_MAX_GAMES` | 300 | tables ouvertes en même temps |
| `BELOTE_CREATE_PER_MIN` | 10 | ouvertures de table par adresse IP et par minute |
| `BELOTE_JOIN_PER_MIN` | 30 | arrivées à une table par adresse IP et par minute |
| `BELOTE_LOG_LEVEL` | info | niveau des journaux |
