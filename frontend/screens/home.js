// Accueil : ouvrir une table, en rejoindre une avec son code, ou jouer sur un seul téléphone.
import { useState } from 'preact/hooks';
import { html } from '../html.js';
import * as E from '../engine.js';
import { newCode } from '../net.js';
import { storage } from '../storage.js';
import { Brand, navigate, toast } from '../ui.js';

function NameInput({ value, onInput, autoFocus }) {
  return html`<label class="field">
    <span>Ton pseudo</span>
    <input type="text" maxlength="20" autocomplete="nickname" placeholder="Ex. Dédé du zinc"
      value=${value} autoFocus=${autoFocus} onInput=${(e) => onInput(e.currentTarget.value)} />
  </label>`;
}

export function Home() {
  const [name, setName] = useState(storage.getName);
  const [code, setCode] = useState('');
  const last = storage.lastTable();

  const open = (e) => {
    e.preventDefault();
    if (!name.trim()) { toast('Choisis d\'abord un pseudo', { error: true }); return; }
    storage.setName(name.trim());
    // la partie vit dans ce téléphone : on la crée ici, la page de la table la met en ligne
    const { game } = E.newGame(newCode(), name.trim());
    storage.saveHost(game);
    navigate(`#/t/${game.code}`);
  };

  const goJoin = (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== 4) { toast('Le code d\'une table fait 4 lettres', { error: true }); return; }
    if (name.trim()) storage.setName(name.trim());
    navigate(`#/t/${c}`);
  };

  return html`<div class="screen home">
    <div class="hero">
      <${Brand} />
      <p class="tagline">La belote des bistrots : chacun pour soi, on annonce ses points et il faut les tenir.</p>
      <div class="hero-cards" aria-hidden="true">
        <span class="mini black">V♠</span><span class="mini red">9♥</span><span class="mini black">A♣</span>
      </div>
    </div>

    ${last ? html`<a class="btn primary big" href=${`#/t/${last}`}>Revenir à la table ${last}</a>` : null}

    <form class="panel col" onSubmit=${open}>
      <h3>Ouvrir une table</h3>
      <${NameInput} value=${name} onInput=${setName} />
      <button class=${`btn big ${last ? '' : 'primary'}`} type="submit">Ouvrir une table</button>
      <p class="tiny muted">De 2 à 6 joueurs, chacun sur son téléphone. Tu montres le QR ou tu donnes le code ;
        ton téléphone fait la table, garde-le allumé.</p>
    </form>

    <form class="panel col" onSubmit=${goJoin}>
      <h3>Rejoindre une table</h3>
      <label class="field">
        <span>Code de la table</span>
        <input class="code-input" type="text" maxlength="4" autocapitalize="characters" autocomplete="off"
          placeholder="ABCD" value=${code} onInput=${(e) => setCode(e.currentTarget.value.toUpperCase())} />
      </label>
      <button class="btn big" type="submit">S'asseoir</button>
    </form>

    <a class="panel solo" href="#/solo">
      <span class="grow"><b>Un seul téléphone</b><br />
        <span class="tiny muted">On se le passe à chaque tour, les mains restent cachées.</span></span>
      <span aria-hidden="true">→</span>
    </a>

    <a class="link center" href="#/regles">Les règles de la belote de comptoir</a>
  </div>`;
}

export function JoinForm({ code, onJoin }) {
  const [name, setName] = useState(storage.getName);

  const join = (e) => {
    e.preventDefault();
    if (!name.trim()) { toast('Choisis d\'abord un pseudo', { error: true }); return; }
    storage.setName(name.trim());
    onJoin(name.trim());
  };

  return html`<div class="screen home">
    <div class="hero"><${Brand} /></div>
    <form class="panel col" onSubmit=${join}>
      <h3>On t'attend à la table <span class="accent">${code}</span></h3>
      <${NameInput} value=${name} onInput=${setName} autoFocus />
      <button class="btn primary big" type="submit">S'asseoir</button>
    </form>
    <a class="link center" href="#/regles">Les règles</a>
  </div>`;
}
