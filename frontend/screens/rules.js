// La règle telle que le jeu l'applique (miroir de docs/regles.md).
import { html } from '../html.js';
import { Brand } from '../ui.js';

export function Rules() {
  return html`<div class="screen rules">
    <div class="hero"><${Brand} /></div>
    <article class="panel col">
      <h2>La règle</h2>
      <p>De 2 à 6 joueurs, <b>chacun pour soi</b>, avec un jeu de 32 cartes. On joue une suite de manches ;
        la donne tourne d'un joueur à chaque manche.</p>

      <h3>La donne</h3>
      <p>Le donneur choisit combien de cartes chacun reçoit : <b>de 1 à 5</b>. Pas de retourne,
        les cartes qui restent ne servent pas.</p>

      <h3>Les annonces</h3>
      <p>En commençant par le joueur qui suit le donneur, chacun annonce le nombre de points qu'il pense
        ramasser dans ses plis, toujours plus haut que l'annonce précédente, ou passe.
        Qui passe ne reparle plus. Quand tous les autres ont passé, le dernier à avoir annoncé est
        le <b>preneur</b> : il choisit l'atout et entame. Si tout le monde passe, personne ne marque
        et la donne tourne.</p>

      <h3>Le jeu de la carte</h3>
      <p>Comme à la belote : on fournit la couleur demandée ; sans elle, on coupe à l'atout ; à l'atout,
        on monte dès qu'on le peut, et qui ne peut pas monter coupe quand même. Sans la couleur ni atout,
        on joue ce qu'on veut. Le plus fort atout, sinon la plus forte carte de la couleur demandée,
        remporte le pli ; son gagnant entame le suivant.</p>

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
        valent 20 (belote-rebelote) ; l'hôte peut couper l'un ou l'autre.</p>

      <h3>Qui marque</h3>
      <p>Si le preneur ramasse au moins les points annoncés, il marque <b>1 point</b>. Sinon, il chute
        et <b>chacun des autres</b> marque 1 point. Le premier à 10 points gagne (l'hôte peut choisir 3,
        5, 15 ou 20), à condition d'être seul en tête : en cas d'égalité, on continue.</p>

      <p class="tiny muted">La belote de comptoir est une variante libre qui change d'un bistrot à
        l'autre : voici les usages retenus ici.</p>
    </article>
    <a class="btn" href="#/">Retour</a>
  </div>`;
}
