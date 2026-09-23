// Point d'entrée commun : `html` est le tag htm lié à Preact.
import { h, Fragment } from 'preact';
import htm from 'htm';

export const html = htm.bind(h);
export { Fragment };
