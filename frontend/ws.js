// WebSocket de la partie : reçoit l'état, se reconnecte tout seul, envoie un ping
// toutes les 25 s. Les actions ne passent jamais par ici (voir api.js).
//
// Un téléphone verrouillé laisse souvent une connexion « à moitié morte » : le socket
// paraît ouvert mais plus rien ne passe. D'où le chien de garde : chaque ping attend
// un pong, et au retour au premier plan on revalide la connexion tout de suite.

const BACKOFF = [1000, 2000, 4000, 8000, 10000];
const PING_MS = 25000;
const PONG_TIMEOUT_MS = 6000;

export function connectGame(code, token, { onState, onError, onStatus, onWake } = {}) {
  let ws = null;
  let attempt = 0;
  let closed = false;
  let pingTimer = null;
  let pongTimer = null;
  let reconnectTimer = null;

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws/${encodeURIComponent(code.toUpperCase())}?token=${encodeURIComponent(token)}`;

  const status = (s) => { if (onStatus) onStatus(s); };

  function clearTimers() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  function scheduleReconnect() {
    if (closed) return;
    const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    attempt += 1;
    status('reconnecting');
    reconnectTimer = setTimeout(open, delay);
  }

  // Ferme une connexion suspecte sans attendre le onclose du navigateur (qui peut
  // mettre des minutes sur mobile) et repart immédiatement.
  function forceReconnect() {
    if (closed) return;
    clearTimers();
    if (ws) {
      const old = ws;
      ws = null;
      old.onclose = null;
      old.onmessage = null;
      try { old.close(); } catch (_) { /* ignore */ }
    }
    attempt = 0;
    open();
  }

  function sendPing() {
    if (!ws || ws.readyState !== WebSocket.OPEN) { forceReconnect(); return; }
    try { ws.send(JSON.stringify({ type: 'ping' })); } catch (_) { forceReconnect(); return; }
    if (pongTimer) clearTimeout(pongTimer);
    pongTimer = setTimeout(forceReconnect, PONG_TIMEOUT_MS);
  }

  function open() {
    if (closed) return;
    clearTimers();
    status(attempt === 0 ? 'connecting' : 'reconnecting');
    try {
      ws = new WebSocket(url);
    } catch (_) {
      scheduleReconnect();
      return;
    }
    const sock = ws;
    sock.onopen = () => {
      if (sock !== ws) return;
      attempt = 0;
      status('online');
      pingTimer = setInterval(sendPing, PING_MS);
    };
    sock.onmessage = (ev) => {
      if (sock !== ws) return;
      if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }  // tout message prouve que la ligne vit
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (msg.type === 'state' && onState) onState(msg.state);
      else if (msg.type === 'error') {
        closed = true;
        clearTimers();
        status('rejected');
        if (onError) onError(msg.detail || 'Connexion refusée.');
      }
      // 'pong' : rien de plus à faire
    };
    sock.onclose = () => {
      if (sock !== ws) return;
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
      ws = null;
      if (!closed) scheduleReconnect();
    };
    sock.onerror = () => {
      // onclose suit toujours ; rien de plus à faire ici
    };
  }

  // Retour au premier plan (déverrouillage, changement d'appli) ou retour du réseau :
  // on revalide la connexion sans attendre, et on laisse l'appli rafraîchir l'état.
  function onVisible() {
    if (closed) return;
    if (document.visibilityState !== 'visible') return;
    if (onWake) onWake();
    if (!ws) {
      clearTimers();
      attempt = 0;
      open();
    } else {
      sendPing();
    }
  }
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onVisible);
  window.addEventListener('pageshow', onVisible);

  open();

  return {
    close() {
      closed = true;
      clearTimers();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('pageshow', onVisible);
      if (ws) { try { ws.close(); } catch (_) { /* ignore */ } ws = null; }
      status('closed');
    },
  };
}
