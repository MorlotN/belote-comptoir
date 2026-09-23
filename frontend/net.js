// Les téléphones se parlent en direct (WebRTC, via PeerJS) : le téléphone de celui qui
// ouvre la table fait tourner la partie et envoie à chacun sa propre vue ; les autres
// n'envoient que leurs actions. Le serveur public de PeerJS sert seulement à se trouver
// (et ses relais TURN quand deux réseaux mobiles ne se voient pas directement).
//
// Une session expose toujours la même chose à l'écran : `act(body)` (une promesse qui
// échoue avec le message à afficher) et `close()`, plus des rappels onState/onStatus.
//
// Messages : invité → hôte  {type:'hello', token?, name?} {type:'act', id, body} {type:'ping'}
//            hôte → invité  {type:'welcome', token, player_id} {type:'state', state}
//                           {type:'ack', id, error?} {type:'reject'|'removed'|'closed', detail} {type:'pong'}

import * as E from './engine.js';
import { storage } from './storage.js';

const PREFIX = 'belote-comptoir-';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';  // sans I, L, O : un code se dicte au comptoir
const PING_MS = 4000;
const SILENCE_MS = 12000;   // plus rien reçu depuis ce délai : la ligne est morte
const ACK_MS = 8000;
const BACKOFF = [1000, 2000, 3000, 5000, 8000];

export const peerId = (code) => PREFIX + code.toUpperCase();

export function newCode() {
  return Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
}

function makePeer(id) {
  if (!window.Peer) throw new Error('Connexion impossible : la bibliothèque réseau ne s\'est pas chargée.');
  return id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
}

const send = (conn, msg) => {
  try { if (conn && conn.open) conn.send(msg); } catch (_) { /* connexion en train de tomber */ }
};

// ----- l'hôte : la partie vit dans son téléphone -----

export function hostTable({ game, onState, onStatus, onFatal }) {
  E.upgrade(game);
  const code = game.code;
  let peer = null;
  let closed = false;
  let retryTimer = null;
  const conns = new Map();     // connexion → id du joueur (null tant qu'il ne s'est pas présenté)
  const lastSeen = new Map();  // connexion → dernier message reçu
  const status = (s) => onStatus && onStatus(s);
  const hostPlayer = () => E.player(game, game.host);

  // Au retour de l'hôte, personne n'est encore reconnecté, sauf lui.
  for (const p of game.players) p.connected = p.id === game.host;

  function push() {
    storage.saveHost(game);
    onState(E.buildView(game, game.host));
    for (const [conn, pid] of conns) {
      if (!pid) continue;
      if (!E.player(game, pid)) {  // retiré de la table
        send(conn, { type: 'removed', detail: "L'hôte t'a retiré de la table" });
        conns.delete(conn);
        setTimeout(() => conn.close(), 400);
      } else send(conn, { type: 'state', state: E.buildView(game, pid) });
    }
  }

  function setConnected(pid, on) {
    const p = E.player(game, pid);
    if (p && p.connected !== on) {
      p.connected = on;
      game.version += 1;
      push();
    }
  }

  function drop(conn) {
    const pid = conns.get(conn);
    conns.delete(conn);
    lastSeen.delete(conn);
    if (pid && ![...conns.values()].includes(pid)) setConnected(pid, false);
  }

  function handle(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    lastSeen.set(conn, Date.now());
    if (msg.type === 'ping') { send(conn, { type: 'pong' }); return; }
    if (msg.type === 'hello') {
      let p = E.playerByToken(game, typeof msg.token === 'string' ? msg.token : '');
      if (!p) {
        if (!msg.name) {
          send(conn, { type: 'reject', detail: "Ta place à cette table n'existe plus" });
          return;
        }
        try {
          p = E.join(game, msg.name);
          game.version += 1;
        } catch (e) {
          send(conn, { type: 'reject', detail: e.detail || 'Impossible de rejoindre' });
          return;
        }
      }
      for (const [other, pid] of conns) {  // une seule connexion vivante par joueur
        if (pid === p.id && other !== conn) { conns.delete(other); other.close(); }
      }
      conns.set(conn, p.id);
      send(conn, { type: 'welcome', token: p.token, player_id: p.id });
      p.connected = true;
      game.version += 1;
      push();
      return;
    }
    if (msg.type === 'act') {
      const p = E.player(game, conns.get(conn));
      if (!p) { send(conn, { type: 'ack', id: msg.id, error: "Tu n'es plus à cette table" }); return; }
      try {
        E.apply(game, p, msg.body);
      } catch (e) {
        send(conn, { type: 'ack', id: msg.id, error: e.detail || 'Action refusée' });
        return;
      }
      send(conn, { type: 'ack', id: msg.id });
      if (!E.player(game, p.id)) {  // il vient de quitter la table
        send(conn, { type: 'removed', detail: 'Tu as quitté la table' });
        conns.delete(conn);
        setTimeout(() => conn.close(), 400);
      }
      push();
    }
  }

  function open(attempt = 0) {
    if (closed) return;
    status('connecting');
    try {
      peer = makePeer(peerId(code));
    } catch (e) {
      onFatal(e.message);
      return;
    }
    peer.on('open', () => status('online'));
    peer.on('connection', (conn) => {
      conns.set(conn, null);
      lastSeen.set(conn, Date.now());
      conn.on('data', (msg) => handle(conn, msg));
      conn.on('close', () => drop(conn));
      conn.on('error', () => drop(conn));
    });
    peer.on('disconnected', () => {
      if (closed) return;
      status('reconnecting');
      retryTimer = setTimeout(() => { try { peer.reconnect(); } catch (_) { /* ignore */ } }, 1500);
    });
    peer.on('error', (err) => {
      if (closed) return;
      if (err.type === 'unavailable-id') {
        // l'ancienne session de ce téléphone tient encore le code sur le serveur : on patiente
        peer.destroy();
        status('reconnecting');
        if (attempt < 20) retryTimer = setTimeout(() => open(attempt + 1), 3000);
        else onFatal('Ce code de table est déjà pris par un autre téléphone.');
      } else if (err.type === 'browser-incompatible') {
        onFatal('Ce navigateur ne sait pas jouer en réseau. Essaie Chrome ou Safari.');
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        status('reconnecting');
        peer.destroy();
        retryTimer = setTimeout(() => open(attempt + 1), BACKOFF[Math.min(attempt, BACKOFF.length - 1)]);
      }
      // 'peer-unavailable' ne concerne pas l'hôte ; les erreurs d'une connexion passent par drop()
    });
  }

  // chien de garde : un téléphone verrouillé laisse une connexion muette
  const watchdog = setInterval(() => {
    const now = Date.now();
    for (const [conn, t] of lastSeen) if (now - t > SILENCE_MS) { conn.close(); drop(conn); }
  }, PING_MS);

  const onVisible = () => {
    if (document.visibilityState === 'visible' && peer && peer.disconnected && !peer.destroyed) {
      try { peer.reconnect(); } catch (_) { /* ignore */ }
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  open();
  onState(E.buildView(game, game.host));

  return {
    role: 'host',
    async act(body) {
      try {
        E.apply(game, hostPlayer(), body);
      } catch (e) {
        throw new Error(e.detail || e.message);
      }
      push();
    },
    // Fermer la table pour de bon : prévenir tout le monde et oublier la partie.
    end() {
      for (const conn of conns.keys()) send(conn, { type: 'closed', detail: "L'hôte a fermé la table" });
      storage.dropHost(code);
      setTimeout(() => this.close(), 300);
    },
    close() {
      closed = true;
      clearInterval(watchdog);
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      if (peer) peer.destroy();
    },
  };
}

// ----- un invité : il envoie ses actions, reçoit sa vue -----

export function joinTable({ code, name, onState, onStatus, onWelcome, onFatal }) {
  let peer = null;
  let conn = null;
  let closed = false;
  let attempt = 0;
  let retryTimer = null;
  let pingTimer = null;
  let lastMsg = Date.now();
  let seq = 0;
  const pending = new Map();
  const status = (s) => onStatus && onStatus(s);

  function fatal(detail) {
    if (closed) return;
    close();
    onFatal(detail);
  }

  function scheduleRetry(state = 'reconnecting') {
    if (closed || retryTimer) return;
    status(state);
    const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!peer || peer.destroyed) openPeer();
      else if (peer.disconnected) { try { peer.reconnect(); } catch (_) { openPeer(); } }
      else connectHost();
    }, delay);
  }

  function handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    lastMsg = Date.now();
    if (msg.type === 'welcome') {
      attempt = 0;
      status('online');
      onWelcome(msg.token, msg.player_id);
    } else if (msg.type === 'state') onState(msg.state);
    else if (msg.type === 'ack') {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve();
    } else if (['reject', 'removed', 'closed'].includes(msg.type)) {
      storage.clearToken(code);
      fatal(msg.detail || 'Connexion refusée');
    }
  }

  function connectHost() {
    if (closed) return;
    status(attempt === 0 ? 'connecting' : 'reconnecting');
    const c = peer.connect(peerId(code), { reliable: true, serialization: 'json' });
    conn = c;
    c.on('open', () => {
      if (c !== conn) return;
      lastMsg = Date.now();
      const token = storage.getToken(code);
      send(c, token ? { type: 'hello', token } : { type: 'hello', name });
    });
    c.on('data', (msg) => { if (c === conn) handle(msg); });
    const lost = () => {
      if (c !== conn || closed) return;
      conn = null;
      scheduleRetry();
    };
    c.on('close', lost);
    c.on('error', lost);
  }

  function openPeer() {
    if (closed) return;
    if (peer) peer.destroy();
    try {
      peer = makePeer();
    } catch (e) {
      fatal(e.message);
      return;
    }
    peer.on('open', connectHost);
    peer.on('disconnected', () => { if (!closed) scheduleRetry(); });
    peer.on('error', (err) => {
      if (closed) return;
      if (err.type === 'peer-unavailable') {
        conn = null;
        scheduleRetry('host-missing');  // table inconnue, ou téléphone de l'hôte en veille
      } else if (err.type === 'browser-incompatible') {
        fatal('Ce navigateur ne sait pas jouer en réseau. Essaie Chrome ou Safari.');
      } else {
        conn = null;
        peer.destroy();
        scheduleRetry();
      }
    });
  }

  pingTimer = setInterval(() => {
    if (!conn || !conn.open) return;
    if (Date.now() - lastMsg > SILENCE_MS) {  // ligne muette : on raccroche et on rappelle
      const dead = conn;
      conn = null;
      try { dead.close(); } catch (_) { /* ignore */ }
      scheduleRetry();
      return;
    }
    send(conn, { type: 'ping' });
  }, PING_MS);

  const onVisible = () => {
    if (document.visibilityState !== 'visible' || closed) return;
    if (!conn || !conn.open || Date.now() - lastMsg > PING_MS * 2) {
      clearTimeout(retryTimer);
      retryTimer = null;
      attempt = 0;
      if (conn) { const dead = conn; conn = null; try { dead.close(); } catch (_) { /* ignore */ } }
      scheduleRetry();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  function close() {
    closed = true;
    clearInterval(pingTimer);
    clearTimeout(retryTimer);
    document.removeEventListener('visibilitychange', onVisible);
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Déconnecté')); }
    pending.clear();
    if (peer) peer.destroy();
  }

  openPeer();

  return {
    role: 'guest',
    act(body) {
      if (!conn || !conn.open) return Promise.reject(new Error('Pas de liaison avec la table, on se reconnecte…'));
      seq += 1;
      const id = seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('La table ne répond pas')); }, ACK_MS);
        pending.set(id, { resolve, reject, timer });
        send(conn, { type: 'act', id, body });
      });
    },
    close,
  };
}
