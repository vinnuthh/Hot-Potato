const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const WS_BASE = (import.meta.env.VITE_WS_URL || '').replace(/\/$/, '');
const SESSION_KEY = 'hot-potato-session';

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function request(path, { method = 'GET', body, session } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (session) {
    headers['x-player-id'] = session.playerId;
    headers['x-session-token'] = session.token;
  }
  let response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot connect to server. Is the backend running?');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404 && !data.error) {
      throw new Error('Backend server not connected. Deploy the backend on Render/Railway and set VITE_API_URL on Vercel.');
    }
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}

export const api = {
  createRoom: (name) => request('/rooms', { method: 'POST', body: { name } }),
  joinRoom: (code, name) => request(`/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body: { name } }),
  reconnect: (code, token) => request(`/rooms/${encodeURIComponent(code)}/reconnect`, { method: 'POST', body: { token } }),
  getState: (code, session) => request(`/rooms/${encodeURIComponent(code)}/state`, { session }),
  ready: (code, session, ready) => request(`/rooms/${encodeURIComponent(code)}/ready`, { method: 'POST', body: { ready }, session }),
  start: (code, session) => request(`/rooms/${encodeURIComponent(code)}/start`, { method: 'POST', session }),
  pass: (code, session, targetId, version) =>
    request(`/rooms/${encodeURIComponent(code)}/pass`, { method: 'POST', body: { targetId, version }, session }),
  check: (code, session) => request(`/rooms/${encodeURIComponent(code)}/check`, { method: 'POST', session }),
  playAgain: (code, session) => request(`/rooms/${encodeURIComponent(code)}/play-again`, { method: 'POST', session }),
  leave: (code, session) => request(`/rooms/${encodeURIComponent(code)}/leave`, { method: 'POST', session }),
};

function websocketUrl({ code, playerId, token }) {
  if (WS_BASE) {
    const base = WS_BASE.startsWith('http') ? WS_BASE.replace(/^http/, 'ws') : WS_BASE;
    return `${base}/ws?room=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}&token=${encodeURIComponent(token)}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}&token=${encodeURIComponent(token)}`;
}

/** Opens an authenticated realtime subscription. Returns a disposer. */
export function connectGameSocket({ code, playerId, token, onState, onExplosion, onConnection }) {
  let socket;
  let retry;
  let closed = false;
  let attempt = 0;

  const open = () => {
    if (closed) return;
    socket = new WebSocket(websocketUrl({ code, playerId, token }));

    socket.addEventListener('open', () => {
      attempt = 0;
      onConnection?.(true);
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'state') onState?.(message.state);
        if (message.type === 'explosion') onExplosion?.(message);
      } catch {
        // Ignore malformed messages.
      }
    });

    socket.addEventListener('close', () => {
      onConnection?.(false);
      if (closed) return;
      attempt += 1;
      const delay = Math.min(1000 * 2 ** Math.min(attempt, 4), 10000);
      retry = setTimeout(open, delay);
    });

    socket.addEventListener('error', () => socket.close());
  };

  open();

  return () => {
    closed = true;
    clearTimeout(retry);
    onConnection?.(false);
    if (socket) socket.close();
  };
}
