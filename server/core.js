import crypto from 'node:crypto';

export const MAX_PLAYERS = 10;
export const STARTING_LIVES = 3;
export const ROUND_BREAK_MS = 2200;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class GameError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new GameError(message, code);
};

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function makeCode() {
  const bytes = crypto.randomBytes(5);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function sanitizeName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 16) {
    fail('Name must be 2–16 characters', 'INVALID_NAME');
  }
  if (!/^[\p{L}\p{N} _-]+$/u.test(name)) {
    fail('Name may only contain letters, numbers, spaces, _ and -', 'INVALID_NAME');
  }
  return name;
}

export function createRoom(now = Date.now()) {
  return {
    code: makeCode(),
    status: 'WAITING',
    hostId: null,
    createdAt: now,
    updatedAt: now,
    matchId: null,
    players: new Map(),
    game: null,
  };
}

export function addPlayer(room, rawName, now = Date.now()) {
  if (room.status !== 'WAITING') fail('This match has already started', 'MATCH_IN_PROGRESS');
  if (room.players.size >= MAX_PLAYERS) fail('Room is full (10 players max)', 'ROOM_FULL');

  const name = sanitizeName(rawName);
  if ([...room.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    fail('That name is already taken in this room', 'NAME_TAKEN');
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const player = {
    id: crypto.randomUUID(),
    name,
    tokenHash: hashToken(token),
    lives: STARTING_LIVES,
    status: 'ALIVE',
    ready: false,
    connected: false,
    disconnectedAt: null,
    eliminatedAt: null,
    joinedAt: now,
  };
  room.players.set(player.id, player);
  if (!room.hostId || !room.players.has(room.hostId)) room.hostId = player.id;
  room.updatedAt = now;
  return { player, token };
}

export function findPlayerByToken(room, token) {
  if (!token) return null;
  const hash = hashToken(token);
  return [...room.players.values()].find((p) => p.tokenHash === hash) ?? null;
}

export function setConnection(room, playerId, connected, now = Date.now()) {
  const player = room.players.get(playerId);
  if (!player) return;
  player.connected = connected;
  player.disconnectedAt = connected ? null : now;
  room.updatedAt = now;
}

export function setReady(room, playerId, ready) {
  if (room.status !== 'WAITING') fail('Ready state can only change in the lobby', 'NOT_IN_LOBBY');
  const player = room.players.get(playerId);
  if (!player) fail('Player not found', 'NO_PLAYER');
  player.ready = Boolean(ready);
  room.updatedAt = Date.now();
}

export function alivePlayers(room) {
  return [...room.players.values()].filter((p) => p.status === 'ALIVE');
}

export function canStart(room) {
  if (!room || room.status !== 'WAITING') return false;
  return [...room.players.values()].filter((p) => p.ready).length >= 2;
}

export function event(room, type, actorId = null, targetId = null, now = Date.now()) {
  if (!room.game) return;
  room.game.events.push({ type, actorId, targetId, round: room.game.roundNumber, at: now });
}

export function startMatch(room, now = Date.now(), random = Math.random) {
  if (!canStart(room)) fail('At least two ready players are required', 'NOT_ENOUGH_READY');
  room.status = 'PLAYING';
  room.matchId = crypto.randomUUID();
  for (const player of room.players.values()) {
    player.lives = STARTING_LIVES;
    player.status = 'ALIVE';
    player.ready = false;
    player.eliminatedAt = null;
  }
  room.game = {
    matchId: room.matchId,
    roundNumber: 0,
    holderId: null,
    status: 'ACTIVE',
    secretExplosionAt: null,
    stateVersion: 0,
    winnerId: null,
    roundResolved: false,
    events: [],
  };
  room.updatedAt = now;
  event(room, 'MATCH_START', null, null, now);
  startRound(room, now, random);
}

export function startRound(room, now = Date.now(), random = Math.random) {
  if (!room.game) fail('No active match', 'NO_MATCH');
  if (room.status !== 'PLAYING') return null;

  const alive = alivePlayers(room);
  if (alive.length <= 1) {
    finishMatch(room, now);
    return null;
  }

  const holder = alive[Math.floor(random() * alive.length) % alive.length];
  const fuse = fuseDuration(random);
  room.game.roundNumber += 1;
  room.game.holderId = holder.id;
  room.game.status = 'ACTIVE';
  room.game.secretExplosionAt = now + fuse;
  room.game.roundResolved = false;
  room.game.stateVersion += 1;
  room.updatedAt = now;
  event(room, 'ROUND_START', holder.id, null, now);
  return { holderId: holder.id, round: room.game.roundNumber };
}

export function fuseDuration(random = Math.random) {
  const min = readIntEnv('FUSE_MIN_SECONDS', 5);
  const max = readIntEnv('FUSE_MAX_SECONDS', 30);
  const lower = Math.max(1, Math.min(min, max));
  const upper = Math.max(lower, max);
  return (lower + Math.floor(random() * (upper - lower + 1))) * 1000;
}

function readIntEnv(name, fallback) {
  const raw = process.env?.[name];
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Server-clock explosion resolution. Idempotent per round: once a round moves
 * out of ACTIVE no other caller can resolve it again.
 */
export function resolveOverdue(room, now = Date.now()) {
  const game = room.game;
  if (!game || room.status !== 'PLAYING' || game.status !== 'ACTIVE') return null;
  if (now < game.secretExplosionAt) return null;

  game.status = 'RESOLVING';
  game.roundResolved = true;
  const victim = room.players.get(game.holderId);
  let eliminated = false;

  if (victim) {
    victim.lives = Math.max(0, victim.lives - 1);
    eliminated = victim.lives === 0;
    if (eliminated) {
      victim.status = 'ELIMINATED';
      victim.eliminatedAt = now;
    }
    event(room, 'EXPLOSION', victim.id, null, now);
    if (eliminated) event(room, 'ELIMINATION', victim.id, null, now);
  }

  game.stateVersion += 1;
  room.updatedAt = now;

  const result = {
    victimId: victim?.id ?? null,
    victimName: victim?.name ?? 'Nobody',
    eliminated,
    round: game.roundNumber,
    matchFinished: alivePlayers(room).length <= 1,
  };

  if (result.matchFinished) finishMatch(room, now);
  return result;
}

export function passBomb(room, { playerId, targetId, version, now = Date.now() }) {
  if (!room.game || room.status !== 'PLAYING') fail('No active match', 'NO_MATCH');
  const game = room.game;

  // Ordering is defined by trusted server processing time: settle an overdue
  // explosion before considering any pass.
  const explosion = resolveOverdue(room, now);
  if (explosion) return { ok: false, expired: true, explosion };

  if (game.status !== 'ACTIVE') {
    return { ok: false, expired: true, explosion: null };
  }
  if (!Number.isInteger(version) || version !== game.stateVersion) {
    fail('That action came from an outdated screen', 'STALE_VERSION');
  }
  const actor = room.players.get(playerId);
  if (!actor || actor.status !== 'ALIVE') fail('Only an active player can pass', 'NOT_ALIVE');
  if (game.holderId !== playerId) fail('Only the bomb holder can pass', 'NOT_HOLDER');

  const target = room.players.get(targetId);
  if (!target || target.status !== 'ALIVE') {
    fail('Target must be an active player in this room', 'INVALID_TARGET');
  }
  if (target.id === playerId) fail('You cannot pass to yourself', 'INVALID_TARGET');

  game.holderId = target.id;
  game.stateVersion += 1;
  room.updatedAt = now;
  event(room, 'PASS', playerId, target.id, now);
  return { ok: true, version: game.stateVersion };
}

export function finishMatch(room, now = Date.now()) {
  if (!room.game) return;
  const winner = alivePlayers(room)[0] ?? null;
  room.game.status = 'COMPLETE';
  room.game.winnerId = winner?.id ?? null;
  room.game.stateVersion += 1;
  room.status = 'FINISHED';
  room.updatedAt = now;
  event(room, 'MATCH_END', winner?.id ?? null, null, now);
}

export function resetToLobby(room, now = Date.now()) {
  room.status = 'WAITING';
  room.matchId = null;
  room.game = null;
  for (const player of room.players.values()) {
    player.lives = STARTING_LIVES;
    player.status = 'ALIVE';
    player.ready = false;
    player.eliminatedAt = null;
  }
  room.updatedAt = now;
}

export function transferHost(room) {
  const current = room.players.get(room.hostId);
  if (current?.connected) return false;
  let candidates = [...room.players.values()]
    .filter((p) => p.connected && (room.status !== 'PLAYING' || p.status === 'ALIVE'))
    .sort((a, b) => a.joinedAt - b.joinedAt);

  if (!candidates.length && !current) {
    candidates = [...room.players.values()]
      .filter((p) => room.status !== 'PLAYING' || p.status === 'ALIVE')
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  if (!candidates.length) {
    if (!current) room.hostId = null;
    return false;
  }
  room.hostId = candidates[0].id;
  return true;
}

export function removePlayer(room, playerId, now = Date.now()) {
  const player = room.players.get(playerId);
  if (!player) return null;

  if (room.status === 'PLAYING') {
    if (player.status === 'ALIVE') {
      player.status = 'ELIMINATED';
      player.lives = 0;
      player.eliminatedAt = now;
      event(room, 'ELIMINATION', player.id, null, now);
    }

    let explosion = null;
    if (room.game && room.game.status === 'ACTIVE' && room.game.holderId === player.id) {
      room.game.secretExplosionAt = now;
      explosion = resolveOverdue(room, now);
    }
    if (alivePlayers(room).length <= 1) {
      finishMatch(room, now);
    }
    transferHost(room);
    room.updatedAt = now;
    return { eliminated: true, explosion, matchFinished: room.status === 'FINISHED' };
  }

  room.players.delete(playerId);
  transferHost(room);
  room.updatedAt = now;
  return { eliminated: false, explosion: null, matchFinished: false };
}

/**
 * Disconnect policy: players get a grace window to reconnect. If they do not
 * return, they are removed in the lobby or eliminated during a match so the
 * match cannot stall. Returns the list of affected player ids.
 */
export function pruneDisconnected(room, graceMs, now = Date.now()) {
  const removed = [];
  for (const player of [...room.players.values()]) {
    if (player.connected || !player.disconnectedAt) continue;
    if (now - player.disconnectedAt < graceMs) continue;

    if (room.status === 'PLAYING') {
      if (player.status === 'ALIVE') {
        player.status = 'ELIMINATED';
        player.lives = 0;
        player.eliminatedAt = now;
        event(room, 'ELIMINATION', player.id, null, now);
        if (room.game && room.game.holderId === player.id && room.game.status === 'ACTIVE') {
          // Force the round to resolve on the server, against the last holder.
          room.game.secretExplosionAt = now;
        }
        if (alivePlayers(room).length <= 1) finishMatch(room, now);
      }
      removed.push(player.id);
    } else {
      room.players.delete(player.id);
      removed.push(player.id);
    }
  }
  if (removed.length) {
    transferHost(room);
    room.updatedAt = now;
  }
  return removed;
}

/**
 * Public projection. Deliberately has no secretExplosionAt, no token hashes,
 * and no internal event details beyond the safe public summary.
 */
export function publicState(room) {
  const players = [...room.players.values()]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => ({
      id: p.id,
      name: p.name,
      lives: p.lives,
      status: p.status,
      ready: p.ready,
      connected: p.connected,
      eliminatedAt: p.eliminatedAt,
      isHost: p.id === room.hostId,
    }));
  const aliveCount = players.reduce((count, player) => count + (player.status === 'ALIVE' ? 1 : 0), 0);

  const game = room.game
    ? {
        matchId: room.game.matchId,
        round: room.game.roundNumber,
        status: room.game.status,
        holderId: room.game.holderId,
        winnerId: room.game.winnerId,
        version: room.game.stateVersion,
        fuse: '?',
        activeCount: aliveCount,
        lastEvent: room.game.events.at(-1) ?? null,
      }
    : null;

  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    maxPlayers: MAX_PLAYERS,
    players,
    game,
    updatedAt: room.updatedAt,
  };
}
