// Cartes : noms français, symboles, et le composant qui les dessine.
import { html } from './html.js';

export const SUITS = ['S', 'H', 'C', 'D'];
export const SUIT_SYMBOL = { S: '♠', H: '♥', C: '♣', D: '♦' };
export const SUIT_NAME = { S: 'pique', H: 'cœur', C: 'trèfle', D: 'carreau' };
const RANK_LABEL = { J: 'V', Q: 'D', K: 'R' };
const RANK_NAME = { 7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix', J: 'valet', Q: 'dame', K: 'roi', A: 'as' };

export const rankOf = (card) => card.slice(0, -1);
export const suitOf = (card) => card.slice(-1);
export const isRed = (card) => ['H', 'D'].includes(suitOf(card));
export const rankLabel = (card) => RANK_LABEL[rankOf(card)] || rankOf(card);

// `withArticle` : « le roi de cœur », « la dame de pique », « l'as de trèfle ».
export function cardName(card, withArticle = false) {
  const r = rankOf(card);
  const name = `${RANK_NAME[r]} de ${SUIT_NAME[suitOf(card)]}`;
  if (!withArticle) return name;
  if (r === 'A') return `l'${name}`;
  return `${r === 'Q' ? 'la' : 'le'} ${name}`;
}

export function Suit({ suit }) {
  return html`<span class=${`suit ${['H', 'D'].includes(suit) ? 'red' : 'black'}`}>${SUIT_SYMBOL[suit]}</span>`;
}

// `size` : 'hand' (grande, dans la main) ou 'table' (posée sur le tapis).
// `value` : sa valeur en points, affichée dans un coin quand l'aide-mémoire est ouvert.
export function Card({ card, size = 'hand', trump, dim, selected, playable, onClick, value }) {
  const s = suitOf(card);
  const cls = ['card', size, isRed(card) ? 'red' : 'black'];
  if (s === trump) cls.push('trump');
  if (dim) cls.push('dim');
  if (selected) cls.push('selected');
  if (playable) cls.push('playable');
  const body = html`
    <span class="c-corner"><span class="c-rank">${rankLabel(card)}</span><span class="c-suit">${SUIT_SYMBOL[s]}</span></span>
    <span class="c-mid">${SUIT_SYMBOL[s]}</span>
    <span class="c-corner c-flip"><span class="c-rank">${rankLabel(card)}</span><span class="c-suit">${SUIT_SYMBOL[s]}</span></span>
    ${value === undefined ? null : html`<span class=${`c-pts ${value ? '' : 'zero'}`} title="points">${value}</span>`}`;
  if (!onClick) return html`<div class=${cls.join(' ')} aria-label=${cardName(card)}>${body}</div>`;
  return html`<button type="button" class=${cls.join(' ')} aria-label=${cardName(card)} onClick=${onClick}>${body}</button>`;
}

export function CardBacks({ count }) {
  if (!count) return null;
  return html`<span class="backs" aria-label=${`${count} carte${count > 1 ? 's' : ''}`}>
    ${Array.from({ length: count }, (_, i) => html`<i key=${i}></i>`)}
  </span>`;
}
