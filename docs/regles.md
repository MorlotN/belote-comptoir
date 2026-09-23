# Règle appliquée par le jeu

La belote de comptoir est une variante libre : les sites de règles (jeu-de-belote.fr,
joueralabelote.org, belotejeu.com, regles2jeux.fr, consultés le 23 septembre 2026)
s'accordent sur le squelette, pas sur les détails. Ce document dit ce que le code
fait, et marque **(choix)** ce que les sources laissent ouvert.

## Ce que disent toutes les sources

- 2 à 6 joueurs, chacun pour soi, jeu de 32 cartes.
- Le donneur donne à chacun **de 1 à 5 cartes**, à son gré (le jeu va jusqu'à 8, voir plus bas). Pas de retourne, pas de
  second tour de distribution ; les cartes restantes ne servent pas.
- Chacun à son tour annonce le nombre de points qu'il pense réaliser, ou passe.
- Le plus offrant joue le premier. Les sources disent qu'il choisit l'atout ; à la table de
  Nicolas, **l'atout est la couleur de la première carte que pose le preneur** (règle
  demandée le 23 septembre 2026, c'est celle du jeu).
- Le jeu de la carte est celui de la belote classique.
- Si le preneur atteint son annonce, il marque **1 point** ; sinon, **chacun des autres
  joueurs** marque 1 point.
- La partie se joue en général en **10 points**.

## Ce que le jeu a tranché

- Même nombre de cartes pour tous, choisi par le donneur à chaque manche, **de 1 à 8**
  (demande de Nicolas le 23 septembre 2026 : « plus de cartes »). Le jeu de 32 limite à 6
  cartes à cinq joueurs et 5 à six.
- **(choix)** Enchères : entier de 1 à 182, toujours strictement plus haut que la
  précédente. Qui passe ne reparle plus. L'enchère s'arrête quand tous les autres ont
  passé ; si tout le monde passe, la manche est blanche et la donne tourne.
- **(choix)** Le premier à parler est le joueur qui suit le donneur, qui sert aussi en
  premier. La donne tourne d'un siège à chaque manche, blanche comprise. Le premier
  donneur est tiré au sort.
- Pas de choix d'atout : le preneur entame et la couleur de sa première carte devient
  l'atout pour toute la manche. La belote-rebelote se constate à ce moment-là (cette
  première carte comprise).
- Obligations au jeu de la carte, chacun pour soi : fournir la couleur demandée ; sans
  elle, couper ; à l'atout (demandé ou en coupe), monter dès qu'on le peut ; qui ne
  peut pas monter coupe quand même (sous-coupe). Sans la couleur ni atout, défausse libre.
- Valeurs classiques : atout V 20, 9 14, A 11, 10 10, R 4, D 3, 8 et 7 0 ; hors atout
  A 11, 10 10, R 4, D 3, V 2, 9 8 7 0. Total 152.
- **(choix, réglable par l'hôte)** Dix de der : +10 au gagnant du dernier pli.
- **(choix, réglable par l'hôte)** Belote-rebelote : +20 à qui tient roi et dame
  d'atout, annoncé automatiquement quand il les pose.
- Le preneur compte ses points de cartes, plus le dix de der et la belote s'ils sont à
  lui, et compare à son annonce (atteindre suffit).
- **(choix)** Objectif réglable par l'hôte : 3, 5, 10 (défaut), 15 ou 20 points. Il
  faut l'atteindre **seul en tête** : en cas d'égalité, on continue.

## Pour changer une règle

Tout est dans `frontend/engine.js` (constantes en tête de fichier, puis une fonction
par action) et testé dans `tests/engine.test.mjs`. La page « Les règles » du jeu
(`frontend/screens/rules.js`) doit suivre.

Un détail propre au jeu sans serveur : l'hôte ne peut pas quitter sa table (elle vit
dans son téléphone) ; « Fermer la table » l'arrête pour tout le monde.
