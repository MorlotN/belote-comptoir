// Petites briques partagées par les écrans : messages éphémères, navigation, en-tête,
// feuille qui monte du bas, écran gardé allumé.
import { useEffect, useState } from 'preact/hooks';
import { html } from './html.js';

export function navigate(hash) {
  if (location.hash !== hash) location.hash = hash;
}

// Adresse de la page, quel que soit le dossier où elle est servie (GitHub Pages : /belote-comptoir/).
export const appUrl = (hash = '') => `${location.origin}${location.pathname}${hash}`;

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

const CONN_LABEL = {
  online: 'En ligne', connecting: 'Connexion…', reconnecting: 'Reconnexion…',
  'host-missing': "L'hôte ne répond pas", local: 'Un seul téléphone',
};

// `label` : ce qu'on affiche à gauche à la place du titre (le code de la table en jeu).
export function TopBar({ label, conn, children }) {
  return html`<header class="topbar">
    ${label ? html`<span class="code-chip">${label}</span>` : html`<${Brand} small />`}
    <div class="row gap-s">
      ${children}
      ${conn && conn !== 'local' ? html`<span class=${`conn ${conn}`} title=${CONN_LABEL[conn] || conn}></span>` : null}
    </div>
  </header>`;
}

// Bandeau quand la liaison flanche : l'écran reste utilisable, on dit juste ce qui se passe.
export function ConnBanner({ conn, role }) {
  if (conn === 'host-missing') {
    return html`<p class="banner">Le téléphone de l'hôte ne répond pas (écran verrouillé ?). On réessaie…</p>`;
  }
  if (conn === 'reconnecting') {
    return html`<p class="banner">${role === 'host' ? 'Liaison réseau perdue' : 'Liaison avec la table perdue'}, on se reconnecte…</p>`;
  }
  return null;
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return html`<div class="overlay" onClick=${onClose}>
    <div class="sheet col" role="dialog" aria-label=${title} onClick=${(e) => e.stopPropagation()}>
      <div class="row"><h2 class="grow">${title}</h2>
        <button class="icon-btn" type="button" onClick=${onClose} aria-label="Fermer">✕</button></div>
      ${children}
    </div>
  </div>`;
}

// Garde l'écran allumé pendant qu'on est à table : un téléphone qui se verrouille coupe la liaison.
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let gone = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (gone) lock.release().catch(() => {});
      } catch (_) { /* refusé (économie d'énergie) : tant pis */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible' && !gone) request(); };
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (lock) lock.release().catch(() => {});
    };
  }, [active]);
}

// L'objectif de la partie en clair : « 10 manches » ou « 200 points ».
export function goal({ mode, target }) {
  return `${target} ${mode === 'points' ? 'points' : 'manches'}`;
}

// Ce qu'on dit d'une façon de gagner, au salon comme dans les règles.
export const MODE_HINT = {
  rounds: 'Chaque manche gagnée vaut 1 : au preneur s\'il tient son annonce, sinon à chacun des autres.',
  points: 'Chaque manche rapporte les points annoncés : au preneur s\'il tient, sinon à chacun des autres.',
};

export function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n > 1 ? pluralWord : word}`;
}
