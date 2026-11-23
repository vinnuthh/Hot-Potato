import http from 'node:http';
import { URL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GameError,
  ROUND_BREAK_MS,
  addPlayer,
  createRoom,
  findPlayerByToken,
  passBomb,
  pruneDisconnected,
  publicState,
  resetToLobby,
  resolveOverdue,
  setConnection,
  setReady,
  startMatch,
  startRound,
  transferHost,
} from './core.js';

const PORT = Number.parseInt(process.env.PORT, 10) || 3001;
const GRACE_MS = Number.parseInt(process.env.DISCONNECT_GRACE_MS, 10) || 15000;
const ROOM_TTL_MS = (Number.parseInt(process.env.ROOM_TTL_HOURS, 10) || 12) * 60 * 60 * 1000;

/** @type {Map<string, ReturnType<typeof createRoom>>} */
const rooms = new Map();
/** @type {Map<string, Set<WebSocket>>} */
const sockets = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const nextRoundTimers = new Map();
/** @type {Map<string, NodeJS.Timeout>} */
const explosionTimers = new Map();

function broadcast(room) {
  const state = publicState(room);
  const message = JSON.stringify({ type: 'state', state });
  for (const socket of sockets.get(room.code) ?? []) {
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }
}

function emit(room, payload) {
  const message = JSON.stringify(payload);
  for (const socket of sockets.get(room.code) ?? []) {
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }
}

/**
 * One timer per live round instead of polling every room four times a second.
 * The private deadline stays server-side; only the resulting state is sent.
 */
function scheduleResolution(room) {
  clearTimeout(explosionTimers.get(room.code));
  explosionTimers.delete(room.code);
  const deadline = room.game?.status === 'ACTIVE' ? room.game.secretExplosionAt : null;
  if (deadline == null || room.status !== 'PLAYING') return;

  const timer = setTimeout(() => {
    explosionTimers.delete(room.code);
    const current = rooms.get(room.code);
    if (!current) return;
    const explosion = resolveOverdue(current, Date.now());
    if (explosion) handleExplosion(current, explosion);
  }, Math.max(0, deadline - Date.now()));
  explosionTimers.set(room.code, timer);
}

function clearRoomTimers(code) {
  clearTimeout(explosionTimers.get(code));
  clearTimeout(nextRoundTimers.get(code));
  explosionTimers.delete(code);
  nextRoundTimers.delete(code);
}

function handleExplosion(room, result, now = Date.now()) {
  if (!result) return;
  emit(room, {
    type: 'explosion',
    round: result.round,
    victimId: result.victimId,
    victimName: result.victimName,
    eliminated: result.eliminated,
  });
  broadcast(room);

  if (!result.matchFinished) {
    clearTimeout(nextRoundTimers.get(room.code));
    nextRoundTimers.set(
      room.code,
      setTimeout(() => {
        nextRoundTimers.delete(room.code);
        if (room.game?.status !== 'RESOLVING' || room.status !== 'PLAYING') return;
        startRound(room, Date.now(), Math.random);
        scheduleResolution(room);
        broadcast(room);
      }, ROUND_BREAK_MS),
    );
  }
}

// Only housekeeping runs periodically; explosions are deadline-driven.
const housekeeping = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const removed = pruneDisconnected(room, GRACE_MS, now);
    if (removed.length) {
      broadcast(room);
      scheduleResolution(room);
    }
  }
}, 1000);
housekeeping.unref?.();

const cleaner = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.updatedAt < ROOM_TTL_MS) continue;
    clearRoomTimers(code);
    for (const socket of sockets.get(code) ?? []) socket.close(1000, 'Room expired');
    sockets.delete(code);
    rooms.delete(code);
  }
}, 60 * 60 * 1000);
cleaner.unref?.();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16_000) reject(new GameError('Request too large', 'PAYLOAD_TOO_LARGE'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new GameError('Invalid JSON body', 'BAD_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function authorize(req, room) {
  const playerId = req.headers['x-player-id'];
  const token = req.headers['x-session-token'];
  const player = room.players.get(playerId);
  if (!player || findPlayerByToken(room, token)?.id !== playerId) {
    throw new GameError('Session expired. Rejoin the room.', 'UNAUTHORIZED');
  }
  return player;
}

function isHost(room, player) {
  if (room.hostId !== player.id) throw new GameError('Only the host can do that', 'NOT_HOST');
}

function sendJSON(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function handleApi(req, res, pathname) {
  const method = req.method ?? 'GET';
  const parts = pathname.split('/').filter(Boolean);

  if (pathname === '/api/health') return sendJSON(res, 200, { ok: true, rooms: rooms.size });

  if (pathname === '/api/rooms' && method === 'POST') {
    const body = await readBody(req);
    const room = createRoom();
    while (rooms.has(room.code)) room.code = createRoom().code;
    const { player, token } = addPlayer(room, body.name);
    rooms.set(room.code, room);
    return sendJSON(res, 201, { code: room.code, playerId: player.id, token, role: 'host' });
  }

  if (parts[1] === 'rooms' && parts[2]) {
    const room = rooms.get(parts[2].toUpperCase());
    if (!room) throw new GameError('Room not found', 'NO_ROOM');
    const action = parts[3];

    if (action === 'join' && method === 'POST') {
      const body = await readBody(req);
      const { player, token } = addPlayer(room, body.name);
      broadcast(room);
      return sendJSON(res, 201, { code: room.code, playerId: player.id, token, role: 'player' });
    }

    if (action === 'reconnect' && method === 'POST') {
      const body = await readBody(req);
      const player = findPlayerByToken(room, body.token);
      if (!player) throw new GameError('Session not found in this room', 'UNAUTHORIZED');
      return sendJSON(res, 200, { code: room.code, playerId: player.id, token: body.token });
    }

    if ((!action || action === 'state') && method === 'GET') {
      authorize(req, room);
      return sendJSON(res, 200, publicState(room));
    }

    const player = authorize(req, room);

    if (action === 'ready' && method === 'POST') {
      const body = await readBody(req);
      setReady(room, player.id, body.ready);
      broadcast(room);
      return sendJSON(res, 200, publicState(room));
    }

    if (action === 'start' && method === 'POST') {
      isHost(room, player);
      startMatch(room, Date.now(), Math.random);
      scheduleResolution(room);
      broadcast(room);
      return sendJSON(res, 200, publicState(room));
    }

    if (action === 'pass' && method === 'POST') {
      const body = await readBody(req);
      const result = passBomb(room, {
        playerId: player.id,
        targetId: body.targetId,
        version: body.version,
        now: Date.now(),
      });
      if (!result.ok && result.explosion) handleExplosion(room, result.explosion);
      else {
        scheduleResolution(room);
        broadcast(room);
      }
      return sendJSON(res, 200, publicState(room));
    }

    if (action === 'check' && method === 'POST') {
      const explosion = resolveOverdue(room, Date.now());
      if (explosion) handleExplosion(room, explosion);
      return sendJSON(res, 200, publicState(room));
    }

    if (action === 'play-again' && method === 'POST') {
      isHost(room, player);
      clearRoomTimers(room.code);
      resetToLobby(room);
      broadcast(room);
      return sendJSON(res, 200, publicState(room));
    }

    if (action === 'leave' && method === 'POST') {
      room.players.delete(player.id);
      transferHost(room);
      if (room.players.size === 0) {
        clearRoomTimers(room.code);
        rooms.delete(room.code);
      } else {
        scheduleResolution(room);
      }
      broadcast(room);
      return sendJSON(res, 200, { ok: true });
    }
  }

  throw new GameError('Not found', 'NOT_FOUND');
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (!pathname.startsWith('/api/')) {
      sendJSON(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
      return;
    }
    await handleApi(req, res, pathname);
  } catch (error) {
    if (res.headersSent) return;
    if (error instanceof GameError) {
      sendJSON(res, error.code === 'UNAUTHORIZED' ? 401 : 400, { error: error.message, code: error.code });
    } else {
      console.error('[api]', error);
      sendJSON(res, 500, { error: 'Internal server error', code: 'INTERNAL' });
    }
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    socket.destroy();
    return;
  }
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const room = rooms.get((url.searchParams.get('room') ?? '').toUpperCase());
  const playerId = url.searchParams.get('playerId');
  const token = url.searchParams.get('token');
  const player = room?.players.get(playerId);
  if (!room || !player || findPlayerByToken(room, token)?.id !== playerId) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.roomCode = room.code;
    ws.playerId = player.id;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  const room = rooms.get(ws.roomCode);
  if (!room) {
    ws.close();
    return;
  }
  if (!sockets.has(room.code)) sockets.set(room.code, new Set());
  sockets.get(room.code).add(ws);
  setConnection(room, ws.playerId, true);
  broadcast(room);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch {
      // Ignore malformed client messages.
    }
  });

  ws.on('close', () => {
    const currentRoom = rooms.get(ws.roomCode);
    if (!currentRoom) return;
    sockets.get(ws.roomCode)?.delete(ws);
    setConnection(currentRoom, ws.playerId, false);
    transferHost(currentRoom);
    broadcast(currentRoom);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HOT POTATO trusted server listening on http://localhost:${PORT}`);
});
