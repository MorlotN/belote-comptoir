# Belote de comptoir

La belote des bistrots, en ligne : **https://morlotn.github.io/belote-comptoir/**

De 2 à 6 joueurs, chacun pour soi. Le donneur choisit de 1 à 8 cartes, chacun annonce
les points qu'il pense faire, le preneur entame et sa première carte donne l'atout.
S'il tient, il gagne la manche, sinon chacun des autres la gagne. On joue en manches
(premier à 10) ou en points (chaque manche rapporte l'annonce, premier à 200). Règle détaillée et choix
faits : `docs/regles.md` (et le bouton « Règles » sur chaque écran du jeu).

Deux façons de jouer :

- **Chacun son téléphone** : un joueur ouvre une table, les autres scannent le QR ou
  tapent le code à 4 lettres.
- **Un seul téléphone** : on inscrit les joueurs et on se passe l'appareil ; un écran
  de passage cache la main du joueur précédent.

## Sans serveur

La page est statique (GitHub Pages). En réseau, **le téléphone de celui qui ouvre la
table fait tourner la partie** : il garde l'état (sauvé dans son navigateur, une
table survit à un rechargement), applique les règles et envoie à chaque joueur sa
propre vue, jamais la main des autres. Les invités n'envoient que leurs actions.

Les téléphones se parlent en direct (WebRTC) grâce à [PeerJS](https://peerjs.com) :
son serveur public gratuit (`0.peerjs.com`) sert seulement à se trouver, et ses
relais TURN prennent le relais quand deux réseaux mobiles ne se voient pas. Limites :

- l'hôte doit garder le jeu ouvert ; l'écran est maintenu allumé pendant la partie,
  et si son téléphone se verrouille, les autres attendent et se reconnectent seuls ;
- si le service PeerJS est en panne, le mode « un seul téléphone » marche toujours.

## Fichiers

- `frontend/engine.js` : la règle, pure, et la vue de chaque joueur
- `frontend/net.js` : hôte et invités (PeerJS), reconnexions, chien de garde
- `frontend/screens/` : accueil, salon, table, un seul téléphone, règles
- `frontend/vendor/` : Preact, htm, PeerJS 1.5.5 (aucune étape de construction)
- `.github/workflows/pages.yml` : tests puis publication sur GitHub Pages à chaque push

## Lancer, tester

```
bin/dev        # http://localhost:8010 (même page qu'en ligne)
bin/test       # moteur de règles : node --test, sans réseau
bin/e2e        # une partie à 3 navigateurs en réseau + une sur un seul téléphone
               # (Chrome système, Python + Playwright dans .venv, il faut Internet)
```

Pour `bin/e2e` : `python3 -m venv .venv && .venv/bin/pip install pytest playwright`.
`BELOTE_SHOTS=/tmp/captures bin/e2e` garde des captures d'écran ;
`BELOTE_URL=https://morlotn.github.io/belote-comptoir/ bin/e2e` joue sur la version en ligne.

La première version (commit b12321f) tournait sur un serveur Python (FastAPI +
WebSocket) ; elle reste dans l'historique si un jour la table doit vivre sur un serveur.
