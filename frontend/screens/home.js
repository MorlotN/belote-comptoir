// Accueil : ouvrir une table ou en rejoindre une avec son code.
import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { api, storage } from '../api.js';
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
  const [busy, setBusy] = useState(false);

  const open = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast('Choisis d\'abord un pseudo', { error: true }); return; }
    setBusy(true);
    try {
      storage.setName(name.trim());
      const res = await api.create(name.trim());
      storage.setToken(res.code, res.token);
      navigate(`#/t/${res.code}`);
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      setBusy(false);
    }
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

    <form class="panel col" onSubmit=${open}>
      <h3>Ouvrir une table</h3>
      <${NameInput} value=${name} onInput=${setName} />
      <button class="btn primary big" type="submit" disabled=${busy}>${busy ? 'Ouverture…' : 'Ouvrir une table'}</button>
      <p class="tiny muted">De 2 à 6 joueurs, chacun sur son téléphone. Tu donnes le code ou le QR aux autres.</p>
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

    <a class="link center" href="#/regles">Les règles de la belote de comptoir</a>
  </div>`;
}

export function JoinForm({ code, onJoined }) {
  const [name, setName] = useState(storage.getName);
  const [busy, setBusy] = useState(false);

  const join = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast('Choisis d\'abord un pseudo', { error: true }); return; }
    setBusy(true);
    try {
      storage.setName(name.trim());
      onJoined(await api.join(code, name.trim()));
    } catch (err) {
      toast(err.message, { error: true });
      setBusy(false);
    }
  };

  return html`<div class="screen home">
    <div class="hero"><${Brand} /></div>
    <form class="panel col" onSubmit=${join}>
      <h3>On t'attend à la table <span class="accent">${code}</span></h3>
      <${NameInput} value=${name} onInput=${setName} autoFocus />
      <button class="btn primary big" type="submit" disabled=${busy}>${busy ? 'On te fait une place…' : 'S\'asseoir'}</button>
    </form>
    <a class="link center" href="#/regles">Les règles</a>
  </div>`;
}
