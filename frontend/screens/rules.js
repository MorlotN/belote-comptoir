// La règle telle que le jeu l'applique (miroir de docs/regles.md) : en page depuis
// l'accueil, et en feuille par le bouton « Règles » pendant la partie.
import { useState } from 'preact/hooks';
import { SUIT_NAME, Suit } from '../cards.js';
import { html } from '../html.js';
import { Brand, MODE_HINT, Sheet, goal } from '../ui.js';

// `state` : la table en cours, pour rappeler ses réglages.
export function RulesContent({ state }) {
  return html`<div class="rules-text col">
    ${state ? html`<p class="table-rules">À cette table : premier à <b>${goal(state)}</b>,
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
    <p>Si le preneur ramasse au moins les points annoncés, il gagne la manche. Sinon, il chute et
      <b>chacun des autres</b> la gagne. L'hôte choisit comment on compte :</p>
    <p><b>En manches</b> : chaque manche gagnée vaut 1, le premier à 10 gagne (ou 3, 5, 15, 20).<br />
      <b>En points</b> : chaque manche gagnée rapporte les points annoncés par le preneur (il annonce
      30 et tient : +30 pour lui ; il chute : +30 pour chacun des autres), le premier à 200 gagne
      (ou 100, 300, 500, 1000).</p>
    <p>Dans les deux cas il faut atteindre l'objectif seul en tête : en cas d'égalité, on continue.</p>

    <p class="tiny muted">La belote de comptoir est une variante libre qui change d'un bistrot à
      l'autre : voici les usages retenus ici.</p>
  </div>`;
}

export function RulesButton({ state }) {
  const [open, setOpen] = useState(false);
  return html`
    <button class="btn tiny" type="button" onClick=${() => setOpen(true)}>Règles</button>
    ${open ? html`<${RulesSheet} state=${state} onClose=${() => setOpen(false)} />` : null}`;
}

export function RulesSheet({ state, onClose }) {
  return html`<${Sheet} title="Les règles" onClose=${onClose}><${RulesContent} state=${state} /></${Sheet}>`;
}

const VALUES = [['V', 20, 2], ['9', 14, 0], ['A', 11, 11], ['10', 10, 10], ['R', 4, 4], ['D', 3, 3], ['8', 0, 0], ['7', 0, 0]];

// Ce qu'il faut savoir maintenant, selon le moment de la manche.
function tip(state) {
  const r = state.round;
  switch (state.phase) {
    case 'deal':
      return `Le donneur choisit combien de cartes chacun reçoit : de 1 à ${state.limits.max_cards}.`;
    case 'bidding':
      return `Annonce les points que tu penses ramasser dans tes plis${state.options.dix_de_der ? ', dix de der compris' : ''}, plus haut que la dernière annonce, ou passe. Qui passe ne reparle plus. Le dernier à annoncer est le preneur.`;
    case 'playing':
      return `${r && r.trump ? '' : 'Le preneur entame : la couleur de sa première carte devient l\'atout. '}Fournis la couleur demandée ; si tu n'en as pas, coupe à l'atout ; à l'atout, monte si tu peux. Sinon, joue ce que tu veux. Les cartes interdites sont grisées.`;
    default:
      return `Le preneur qui ramasse au moins son annonce gagne la manche, sinon chacun des autres la gagne. ${MODE_HINT[state.mode]}`;
  }
}

// L'aide-mémoire qui s'affiche à côté du plateau quand on touche « Règles ».
export function CheatSheet({ state, onMore, onClose }) {
  const trump = state.round && state.round.trump;
  return html`<aside class="panel cheat" aria-label="Aide-mémoire">
    <div class="row">
      <h3 class="grow">Aide-mémoire</h3>
      <button class="link small" type="button" onClick=${onMore}>Toutes les règles</button>
      <button class="icon-btn" type="button" onClick=${onClose} aria-label="Fermer l'aide-mémoire">✕</button>
    </div>
    <table class="cheat-values">
      <thead><tr><th></th>${VALUES.map(([k]) => html`<th key=${k}>${k}</th>`)}</tr></thead>
      <tbody>
        <tr class=${trump ? 'hot' : ''}><td>Atout${trump ? html` <${Suit} suit=${trump} />` : null}</td>${VALUES.map(([k, t]) => html`<td key=${k}>${t}</td>`)}</tr>
        <tr><td>Autres</td>${VALUES.map(([k, , o]) => html`<td key=${k}>${o}</td>`)}</tr>
      </tbody>
    </table>
    <p class="tiny muted">${[
      trump ? `Atout : ${SUIT_NAME[trump]}.` : '',
      'V valet, D dame, R roi.',
      state.options.dix_de_der ? 'Dernier pli : +10.' : '',
      state.options.belote ? 'Roi + dame d\'atout : +20.' : '',
      'Chaque carte affiche sa valeur.',
    ].filter(Boolean).join(' ')}</p>
    <p class="small">${tip(state)}</p>
  </aside>`;
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
