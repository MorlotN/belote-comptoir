// Salon : on s'assoit, l'hôte règle la partie et lance.
import { useMemo } from 'preact/hooks';
import { html } from '../html.js';
import { qrSvg } from '../qr.js';
import { TopBar, toast } from '../ui.js';

function shareLink(code) {
  return `${location.origin}/#/t/${code}`;
}

async function share(code) {
  const url = shareLink(code);
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Belote de comptoir', text: `Viens t'asseoir à la table ${code}`, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('Lien copié');
  } catch (_) { /* partage annulé */ }
}

function Qr({ text }) {
  const svg = useMemo(() => {
    try { return qrSvg(text, { level: 'M', margin: 1 }); } catch (_) { return null; }
  }, [text]);
  if (!svg) return null;
  return html`<div class="qr" dangerouslySetInnerHTML=${{ __html: svg }}></div>`;
}

function Toggle({ label, hint, checked, disabled, onChange }) {
  return html`<label class=${`toggle ${disabled ? 'disabled' : ''}`}>
    <span class="grow"><b>${label}</b><br /><span class="tiny muted">${hint}</span></span>
    <input type="checkbox" checked=${checked} disabled=${disabled} onChange=${(e) => onChange(e.currentTarget.checked)} />
    <i class="switch"></i>
  </label>`;
}

export function Lobby({ state, act, conn }) {
  const isHost = state.me === state.host;
  const { min_players: minP, max_players: maxP } = state.limits;
  const enough = state.players.length >= minP;

  return html`<div class="screen">
    <${TopBar} code=${state.code} conn=${conn} />

    <section class="panel invite">
      <div class="col grow">
        <h3>Table</h3>
        <div class="big-code">${state.code}</div>
        <p class="tiny muted">Scanne le QR ou tape le code sur l'accueil.</p>
        <button class="btn small" type="button" onClick=${() => share(state.code)}>Partager le lien</button>
      </div>
      <${Qr} text=${shareLink(state.code)} />
    </section>

    <section class="panel col">
      <div class="row">
        <h3 class="grow">Autour du comptoir</h3>
        <span class="tiny muted">${state.players.length} / ${maxP}</span>
      </div>
      <ul class="seats">
        ${state.players.map((p) => html`<li key=${p.id} class=${p.connected ? '' : 'away'}>
          <span class=${`dot ${p.connected ? 'on' : ''}`}></span>
          <span class="grow">${p.name}${p.id === state.me ? html` <span class="muted">(toi)</span>` : null}</span>
          ${p.host ? html`<span class="badge">hôte</span>` : null}
          ${isHost && p.id !== state.me
            ? html`<button class="icon-btn" type="button" aria-label=${`Retirer ${p.name}`}
                onClick=${() => act({ type: 'remove', player_id: p.id })}>✕</button>`
            : null}
        </li>`)}
      </ul>
      ${!enough ? html`<p class="small muted">Il faut au moins ${minP} joueurs.</p>` : null}
    </section>

    <section class="panel col">
      <h3>Réglages ${isHost ? '' : html`<span class="tiny muted">(l'hôte décide)</span>`}</h3>
      <div class="field">
        <span>Partie gagnée à</span>
        <div class="segmented">
          ${state.targets.map((t) => html`<button key=${t} type="button" class=${t === state.target ? 'on' : ''}
            disabled=${!isHost} onClick=${() => act({ type: 'options', target: t })}>${t}</button>`)}
        </div>
        <span class="tiny muted">points. Un point par manche : au preneur s'il tient, sinon à chacun des autres.</span>
      </div>
      <${Toggle} label="Dix de der" hint="Le dernier pli rapporte 10 points de plus."
        checked=${state.options.dix_de_der} disabled=${!isHost}
        onChange=${(v) => act({ type: 'options', dix_de_der: v })} />
      <${Toggle} label="Belote-rebelote" hint="Roi et dame d'atout dans la même main : 20 points."
        checked=${state.options.belote} disabled=${!isHost}
        onChange=${(v) => act({ type: 'options', belote: v })} />
    </section>

    <div class="col sticky-actions">
      ${isHost
        ? html`<button class="btn primary big" type="button" disabled=${!enough} onClick=${() => act({ type: 'start' })}>
            Distribuer${enough ? '' : ` (${minP} joueurs min.)`}
          </button>`
        : html`<p class="waiting center">En attente de l'hôte…</p>`}
      <div class="row center-row">
        <a class="link small" href="#/regles">Les règles</a>
        <button class="link small" type="button" onClick=${() => act({ type: 'remove', player_id: state.me })}>Quitter la table</button>
      </div>
    </div>
  </div>`;
}
