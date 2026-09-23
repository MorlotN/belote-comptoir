// La règle telle que le jeu l'applique (miroir de docs/regles.md) : en page depuis
// l'accueil, et en feuille par le bouton « Règles » pendant la partie.
import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { Brand, Sheet } from '../ui.js';

// `state` : la table en cours, pour rappeler ses réglages.
export function RulesContent({ state }) {
  const target = state ? state.target : 10;
  return html`<div class="rules-text col">
    ${state ? html`<p class="table-rules">À cette table : premier à <b>${target}</b> points,
      dix de der <b>${state.options.dix_de_der ? 'oui' : 'non'}</b>,
      belote-rebelote <b>${state.options.belote ? 'oui' : 'non'}</b>.</p>` : null}

    <p>De 2 à 6 joueurs, <b>chacun pour soi</b>, avec un jeu de 32 cartes. On joue une suite de manches ;
      la donne tourne d'un joueur à chaque manche.</p>

    <h3>La donne</h3>
    <p>Le donneur choisit combien de cartes chacun reçoit : <b>de 1 à 8</b> (6 au plus à cinq
      joueurs, 5 à six). Pas de retourne, les cartes qui restent ne servent pas.</p>

    <h3>Les annonces</h3>
    <p>En commençant par le joueur qui suit le donneur, chacun annonce le nombre de points qu'il pense
      ramasser dans ses plis, toujours plus haut que l'annonce précédente, ou passe.
      Qui passe ne reparle plus. Quand tous les autres ont passé, le dernier à avoir annoncé est
      le <b>preneur</b>. Si tout le monde passe, personne ne marque et la donne tourne.</p>

    <h3>L'atout</h3>
    <p>On ne choisit pas l'atout : le preneur entame, et <b>la couleur de la première carte qu'il
      pose devient l'atout</b> pour toute la manche. Sur ce premier pli, les autres doivent donc
      fournir à l'atout et monter s'ils le peuvent.</p>

    <h3>Le jeu de la carte</h3>
    <p>Comme à la belote : on fournit la couleur demandée ; sans elle, on coupe à l'atout ; à l'atout,
      on monte dès qu'on le peut, et qui ne peut pas monter coupe quand même. Sans la couleur ni atout,
      on joue ce qu'on veut. Le plus fort atout, sinon la plus forte carte de la couleur demandée,
      remporte le pli ; son gagnant entame le suivant. Le jeu grise les cartes interdites.</p>

    <h3>Valeur des cartes</h3>
    <table class="values">
      <thead><tr><th></th><th>Atout</th><th>Autres</th></tr></thead>
      <tbody>
        <tr><td>Valet</td><td>20</td><td>2</td></tr>
        <tr><td>Neuf</td><td>14</td><td>0</td></tr>
        <tr><td>As</td><td>11</td><td>11</td></tr>
        <tr><td>Dix</td><td>10</td><td>10</td></tr>
        <tr><td>Roi</td><td>4</td><td>4</td></tr>
        <tr><td>Dame</td><td>3</td><td>3</td></tr>
        <tr><td>8 et 7</td><td>0</td><td>0</td></tr>
      </tbody>
    </table>
    <p class="small muted">Ordre à l'atout : V, 9, A, 10, R, D, 8, 7. Ailleurs : A, 10, R, D, V, 9, 8, 7.
      Le dernier pli vaut 10 de plus (dix de der) et le roi et la dame d'atout dans la même main
      valent 20 (belote-rebelote) ; l'hôte peut retirer l'un ou l'autre avant de lancer la partie.</p>

    <h3>Qui marque</h3>
    <p>Si le preneur ramasse au moins les points annoncés, il marque <b>1 point</b>. Sinon, il chute
      et <b>chacun des autres</b> marque 1 point. Le premier à ${target} points gagne, à condition
      d'être seul en tête : en cas d'égalité, on continue.</p>

    <p class="tiny muted">La belote de comptoir est une variante libre qui change d'un bistrot à
      l'autre : voici les usages retenus ici.</p>
  </div>`;
}

export function RulesButton({ state }) {
  const [open, setOpen] = useState(false);
  return html`
    <button class="btn tiny" type="button" onClick=${() => setOpen(true)}>Règles</button>
    ${open ? html`<${Sheet} title="Les règles" onClose=${() => setOpen(false)}><${RulesContent} state=${state} /></${Sheet}>` : null}`;
}

export function Rules() {
  return html`<div class="screen rules">
    <div class="hero"><${Brand} /></div>
    <article class="panel col">
      <h2>La règle</h2>
      <${RulesContent} />
    </article>
    <a class="btn" href="#/">Retour</a>
  </div>`;
}
