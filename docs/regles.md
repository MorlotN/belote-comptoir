# Règle appliquée par le jeu

La belote de comptoir est une variante libre : les sites de règles (jeu-de-belote.fr,
joueralabelote.org, belotejeu.com, regles2jeux.fr, consultés le 23 septembre 2026)
s'accordent sur le squelette, pas sur les détails. Ce document dit ce que le code
fait, et marque **(choix)** ce que les sources laissent ouvert.

## Ce que disent toutes les sources

- 2 à 6 joueurs, chacun pour soi, jeu de 32 cartes.
- Le donneur donne à chacun **de 1 à 5 cartes**, à son gré. Pas de retourne, pas de
  second tour de distribution ; les cartes restantes ne servent pas.
- Chacun à son tour annonce le nombre de points qu'il pense réaliser, ou passe.
- Le plus offrant choisit l'atout et joue le premier.
- Le jeu de la carte est celui de la belote classique.
- Si le preneur atteint son annonce, il marque **1 point** ; sinon, **chacun des autres
  joueurs** marque 1 point.
- La partie se joue en général en **10 points**.

## Ce que le jeu a tranché

- **(choix)** Même nombre de cartes pour tous, choisi par le donneur à chaque manche.
- **(choix)** Enchères : entier de 1 à 182, toujours strictement plus haut que la
  précédente. Qui passe ne reparle plus. L'enchère s'arrête quand tous les autres ont
  passé ; si tout le monde passe, la manche est blanche et la donne tourne.
- **(choix)** Le premier à parler est le joueur qui suit le donneur, qui sert aussi en
  premier. La donne tourne d'un siège à chaque manche, blanche comprise. Le premier
  donneur est tiré au sort.
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
