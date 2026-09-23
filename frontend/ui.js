// Petites briques partagées par les écrans : messages éphémères, navigation, en-tête.
import { useEffect, useState } from 'preact/hooks';
import { html } from './html.js';

export function navigate(hash) {
  if (location.hash !== hash) location.hash = hash;
}

let pushToast = () => {};
export function toast(text, { error = false } = {}) { pushToast({ text, error }); }

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let id = 0;
    pushToast = (t) => {
      const item = { ...t, id: ++id };
      setItems((xs) => [...xs.slice(-2), item]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== item.id)), 3200);
    };
  }, []);
  return html`<div class="toasts" aria-live="polite">
    ${items.map((t) => html`<div key=${t.id} class=${`toast ${t.error ? 'error' : ''}`}>${t.text}</div>`)}
  </div>`;
}

export function Brand({ small = false }) {
  return html`<a class=${`brand ${small ? 'small' : ''}`} href="#/">Belote <em>de comptoir</em></a>`;
}

const CONN_LABEL = { online: 'En ligne', connecting: 'Connexion…', reconnecting: 'Reconnexion…', rejected: 'Refusé', closed: 'Fermé' };

export function TopBar({ code, conn, children }) {
  return html`<header class="topbar">
    <${Brand} small />
    <div class="row gap-s">
      ${children}
      <span class="code-chip">${code}</span>
      <span class=${`conn ${conn}`} title=${CONN_LABEL[conn] || conn}></span>
    </div>
  </header>`;
}

export function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n > 1 ? pluralWord : word}`;
}
