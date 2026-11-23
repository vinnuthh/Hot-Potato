import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  GameError,
  MAX_PLAYERS,
  addPlayer,
  alivePlayers,
  canStart,
  createRoom,
  passBomb,
  publicState,
  pruneDisconnected,
  resetToLobby,
  resolveOverdue,
  setConnection,
  setReady,
  startMatch,
  transferHost,
} from './core.js';

const fixedRandom = () => 0;
let now;

beforeEach(() => {
  now = 1_000_000;
  process.env.FUSE_MIN_SECONDS = '5';
  process.env.FUSE_MAX_SECONDS = '30';
});

function makeRoom(playerCount = 2) {
  const room = createRoom(now);
  const sessions = [];
  for (let index = 0; index < playerCount; index += 1) {
    sessions.push(addPlayer(room, `Player${index + 1}`, now));
  }
  return { room, sessions };
}

function start(room) {
  for (const player of room.players.values()) setReady(room, player.id, true);
  startMatch(room, now, fixedRandom);
}

test('room accepts at most 10 players and rejects the 11th', () => {
  const { room } = makeRoom(MAX_PLAYERS);
  assert.equal(room.players.size, 10);
  assert.throws(() => addPlayer(room, 'Eleventh', now), (error) => error instanceof GameError && error.code === 'ROOM_FULL');
});

test('match requires at least two ready players and starts with one holder', () => {
  const { room } = makeRoom(3);
  assert.equal(canStart(room), false);
  setReady(room, [...room.players.keys()][0], true);
  assert.equal(canStart(room), false);
  setReady(room, [...room.players.keys()][1], true);
  assert.equal(canStart(room), true);
  startMatch(room, now, fixedRandom);
  assert.equal(room.status, 'PLAYING');
  assert.equal(alivePlayers(room).length, 3);
  assert.equal(room.game.roundNumber, 1);
  assert.ok(room.players.has(room.game.holderId));
  assert.ok([...room.players.values()].every((player) => player.lives === 3));
});

test('public state never exposes the secret explosion deadline', () => {
  const { room } = makeRoom();
  start(room);
  const state = publicState(room);
  const serialized = JSON.stringify(state);
  assert.equal(room.game.secretExplosionAt, now + 5000);
  assert.equal(serialized.includes('secretExplosionAt'), false);
  assert.equal(state.game.fuse, '?');
  assert.equal(serialized.includes('tokenHash'), false);
});

test('only the holder can pass, to a living player in the same room, with a current version', () => {
  const { room, sessions } = makeRoom(3);
  start(room);
  const holder = room.game.holderId;
  const other = [...room.players.keys()].find((id) => id !== holder);
  const nonHolder = sessions.find((session) => session.player.id !== holder).player.id;
  const version = room.game.stateVersion;

  assert.throws(
    () => passBomb(room, { playerId: nonHolder, targetId: holder, version, now }),
    (error) => error.code === 'NOT_HOLDER',
  );
  assert.throws(
    () => passBomb(room, { playerId: holder, targetId: 'not-a-player', version, now }),
    (error) => error.code === 'INVALID_TARGET',
  );
  assert.throws(
    () => passBomb(room, { playerId: holder, targetId: other, version: version - 1, now }),
    (error) => error.code === 'STALE_VERSION',
  );
  assert.equal(room.game.holderId, holder);

  const result = passBomb(room, { playerId: holder, targetId: other, version, now });
  assert.equal(result.ok, true);
  assert.equal(room.game.holderId, other);
  assert.equal(room.game.stateVersion, version + 1);
  assert.equal(room.game.events.at(-1).type, 'PASS');

  room.players.get(holder).status = 'ELIMINATED';
  assert.throws(
    () => passBomb(room, { playerId: other, targetId: holder, version: room.game.stateVersion, now }),
    (error) => error.code === 'INVALID_TARGET',
  );
});

test('explosion deducts exactly one life and resolves only once', () => {
  const { room } = makeRoom();
  start(room);
  const victim = room.players.get(room.game.holderId);
  const deadline = room.game.secretExplosionAt;

  assert.equal(resolveOverdue(room, deadline - 1), null);
  const first = resolveOverdue(room, deadline);
  assert.equal(first.victimId, victim.id);
  assert.equal(victim.lives, 2);
  assert.equal(resolveOverdue(room, deadline + 10_000), null);
  assert.equal(victim.lives, 2);
  assert.equal(room.game.events.filter((event) => event.type === 'EXPLOSION').length, 1);
});

test('a pass at or after the deadline is rejected and the holder is penalised', () => {
  const { room } = makeRoom();
  start(room);
  const holder = room.game.holderId;
  const other = [...room.players.keys()].find((id) => id !== holder);
  const version = room.game.stateVersion;
  const result = passBomb(room, { playerId: holder, targetId: other, version, now: room.game.secretExplosionAt });
  assert.equal(result.ok, false);
  assert.equal(result.expired, true);
  assert.equal(room.game.holderId, holder);
  assert.equal(room.players.get(holder).lives, 2);
});

test('eliminated players become spectators and the last player alive wins', () => {
  const { room } = makeRoom(3);
  start(room);
  const first = room.game.holderId;
  room.players.get(first).lives = 1;

  let result = resolveOverdue(room, room.game.secretExplosionAt);
  assert.equal(result.eliminated, true);
  assert.equal(room.players.get(first).status, 'ELIMINATED');
  assert.equal(room.game.status, 'RESOLVING');

  // Server starts the next round; force the second explosion deterministically.
  const second = [...room.players.values()].find((player) => player.status === 'ALIVE');
  second.lives = 1;
  room.game.status = 'ACTIVE';
  room.game.holderId = second.id;
  room.game.secretExplosionAt = now + 1000;
  result = resolveOverdue(room, now + 1000);
  assert.equal(result.matchFinished, true);
  assert.equal(room.status, 'FINISHED');
  assert.equal(room.game.status, 'COMPLETE');
  assert.ok(room.game.winnerId);
  assert.equal(alivePlayers(room).length, 1);
  assert.equal(room.game.events.at(-1).type, 'MATCH_END');
});

test('play again resets the lobby to three lives and no match state', () => {
  const { room } = makeRoom();
  start(room);
  resolveOverdue(room, room.game.secretExplosionAt);
  resetToLobby(room, now);
  assert.equal(room.status, 'WAITING');
  assert.equal(room.game, null);
  assert.ok([...room.players.values()].every((player) => player.lives === 3 && !player.ready));
});

test('disconnected players get a grace window, then the host is transferred', () => {
  const { room, sessions } = makeRoom(2);
  const [first, second] = sessions;
  setConnection(room, first.player.id, true, now);
  setConnection(room, second.player.id, true, now);
  setConnection(room, first.player.id, false, now);

  assert.deepEqual(pruneDisconnected(room, 15_000, now + 14_000), []);
  assert.deepEqual(pruneDisconnected(room, 15_000, now + 15_000), [first.player.id]);
  assert.equal(room.hostId, second.player.id);
  assert.equal(transferHost(room), false);
});
