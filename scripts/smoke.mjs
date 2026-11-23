import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import WebSocket from 'ws';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = 3999;
const base = `http://localhost:${port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), FUSE_MIN_SECONDS: '1', FUSE_MAX_SECONDS: '1', ROUND_BREAK_MS: '2200' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
child.stdout.on('data', (chunk) => { serverLog += chunk; });
child.stderr.on('data', (chunk) => { serverLog += chunk; });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // Server still starting.
    }
    await sleep(100);
  }
  throw new Error(`Server did not start:\n${serverLog}`);
}

async function call(pathname, { method = 'GET', body, session } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (session) {
    headers['x-player-id'] = session.playerId;
    headers['x-session-token'] = session.token;
  }
  const response = await fetch(`${base}/api${pathname}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

function subscribe(code, session, messages) {
  const socket = new WebSocket(
    `ws://localhost:${port}/ws?room=${code}&playerId=${session.playerId}&token=${encodeURIComponent(session.token)}`,
  );
  socket.on('message', (raw) => messages.push(JSON.parse(String(raw))));
  return socket;
}

async function main() {
  await waitForHealth();

  const created = await call('/rooms', { method: 'POST', body: { name: 'Alpha' } });
  assert.equal(created.status, 201);
  const host = created.data;
  const code = host.code;
  assert.equal(code.length, 5);

  const joined = await call(`/rooms/${code}/join`, { method: 'POST', body: { name: 'Beta' } });
  assert.equal(joined.status, 201);
  const guest = joined.data;

  const extra = await call(`/rooms/${code}/join`, { method: 'POST', body: { name: 'Gamma' } });
  assert.equal(extra.status, 201);
  const third = extra.data;

  const forbiddenStart = await call(`/rooms/${code}/start`, { method: 'POST', session: guest });
  assert.equal(forbiddenStart.status, 400);
  assert.equal(forbiddenStart.data.code, 'NOT_HOST');

  for (const session of [host, guest, third]) {
    const result = await call(`/rooms/${code}/ready`, { method: 'POST', body: { ready: true }, session });
    assert.equal(result.ok, true);
  }

  const start = await call(`/rooms/${code}/start`, { method: 'POST', session: host });
  assert.equal(start.ok, true);
  assert.equal(start.data.game.round, 1);
  assert.equal(start.data.game.fuse, '?');
  assert.equal(JSON.stringify(start.data).includes('secretExplosionAt'), false);

  const messages = [];
  const sockets = [host, guest, third].map((session) => subscribe(code, session, messages));
  await sleep(150);
  assert.ok(sockets.every((socket) => socket.readyState === WebSocket.OPEN));

  const holder = start.data.players.find((player) => player.id === start.data.game.holderId);
  const target = start.data.players.find((player) => player.id !== holder.id);
  const holderSession = [host, guest, third].find((session) => session.playerId === holder.id);

  const wrongPass = await call(`/rooms/${code}/pass`, {
    method: 'POST', body: { targetId: holder.id, version: start.data.game.version },
    session: [host, guest, third].find((session) => session.playerId === target.id),
  });
  assert.equal(wrongPass.data.code, 'NOT_HOLDER');

  const pass = await call(`/rooms/${code}/pass`, {
    method: 'POST', body: { targetId: target.id, version: start.data.game.version }, session: holderSession,
  });
  assert.equal(pass.ok, true);
  assert.equal(pass.data.game.holderId, target.id);

  await sleep(1400);
  const afterBoom = await call(`/rooms/${code}/state`, { session: host });
  assert.equal(afterBoom.ok, true);
  assert.equal(afterBoom.data.players.find((player) => player.id === target.id).lives, 2);
  assert.ok(messages.some((message) => message.type === 'explosion'));
  assert.equal(messages.some((message) => JSON.stringify(message).includes('secretExplosionAt')), false);
  assert.ok(messages.filter((message) => message.type === 'state').length >= 3, 'all clients received state updates');

  sockets.forEach((socket) => socket.close());
  console.log('Smoke test passed: rooms, auth, ready, start, pass, hidden fuse, explosion and realtime broadcasts.');
}

main()
  .then(() => child.kill())
  .catch((error) => {
    console.error(error);
    console.error(serverLog);
    child.kill();
    process.exitCode = 1;
  });
