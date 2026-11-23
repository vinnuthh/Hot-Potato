# HOT POTATO — Multiplayer Survival Game

A browser-based 2–10 player party game built from the project blueprint in `HOT_POTATO_Multiplayer_Game_Blueprint.pdf`.

**Hold the bomb. Pass it fast. Never see the fuse. Last player alive wins.**

## Run it

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. Open a second browser window (or a phone on the same Wi-Fi using your machine's LAN IP) and join with the 5-character room code.

To run on your LAN, Vite is configured with `host: true` and proxies `/api` and `/ws` to the trusted server on port 3001.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Frontend + trusted server with watch mode |
| `npm run build` | Production frontend bundle in `dist/` |
| `npm test` | Core game-rule tests (9 tests) |
| `npm run test:e2e` | Real HTTP + WebSocket smoke test |
| `npm start` | Trusted server only (pair with a hosted static build) |

Optional config lives in `.env.example` (fuse range, disconnect grace, room TTL, server port). Defaults: fuse **5–30 s**, grace **15 s**, TTL **12 h**.

## How it maps to the blueprint

| Blueprint requirement | Implementation |
| --- | --- |
| React + Vite, responsive screens | `src/`, Framer Motion, Lucide icons, WebAudio sound + mute toggle |
| 2–10 player rooms, code, ready, host start | `server/core.js` (limits/validation), `src/pages/Lobby.jsx` |
| Hidden, unpredictable fuse | `fuseDuration()` in `server/core.js`; only public projection is sent to clients |
| Server-authoritative passing and explosion | `passBomb()` / `resolveOverdue()` with version checks and single-writer round lock |
| Idempotent explosion, one life per round | Round state moves `ACTIVE → RESOLVING → COMPLETE`; resolver refuses non-active rounds |
| Overdue rounds resolve even if everyone disconnects | 250 ms trusted server tick in `server/index.js` |
| Elimination, spectator, winner, play again | `src/pages/Spectator.jsx`, `Winner.jsx`, `hp_play_again` equivalent in server |
| Session tokens, hashes only | 24-byte random token per player; only SHA-256 hash kept server-side |
| No secret in client payloads | `publicState()` whitelist; smoke test asserts the deadline is never broadcast |
| Supabase alternative | `supabase/migrations/0001_hot_potato.sql` (reference schema, RLS and RPCs) |

The bundled local server replaces Supabase for this build (your chosen option). The SQL migration is a documented starting point for moving to the blueprint's Supabase stack — it is **not wired into the React client** and needs testing in a scratch project first.

## Game rules implemented

- Room sizes 2–10; the 11th join is rejected. Late joins during a match are blocked.
- Every player starts with 3 lives. Host needs at least 2 ready players to start.
- A random active player holds the bomb each round; passes are validated server-side.
- The hidden deadline is chosen from 5–30 s and never sent to browsers.
- The holder at the server-resolved explosion loses exactly 1 life; 0 lives means eliminated/spectator.
- The match ends at one active player. Uncertain pass timing is decided by server processing order with a state version guard.

## Operational policies (chosen defaults)

- **Disconnect:** 15 s reconnection grace. Lobby players are removed; in-match players are eliminated so the match cannot stall. Session tokens let a player restore state after a refresh.
- **Host disconnect:** transferred to the earliest connected eligible player.
- **Room cleanup:** inactive rooms are removed after 12 hours.
- **Play again:** host-only reset back to the lobby with lives restored and ready states cleared.

## Security notes

- Only public state crosses the wire: names, lives, ready, status, holder, round, match status.
- Clients cannot set lives, holder, deadline, elimination or winner — those exist only server-side.
- Session tokens are stored hashed on the server; the raw token lives in browser local storage for reconnection only.
- No Supabase keys are used by this build. If you adopt the SQL migration, use only the public publishable/anon key in `VITE_*` variables and enable pg_cron for the resolver.

## Testing

`npm test` covers room limits, ready/start gating, exactly-one holder, hidden-deadline projection, pass validation, stale versions, exactly-once explosions, elimination, winner selection, play-again reset and disconnect/host transfer.

`npm run test:e2e` spawns the real server on port 3999 and checks room creation, joining, auth, ready, host-only start, pass validation, hidden fuse, life deduction and realtime broadcasts to every client.

## Deployment

Build with `npm run build`, serve `dist/` as a static site (e.g. Vercel), and run `npm start` as the trusted backend. Point the frontend at the backend using `VITE_API_URL` and `VITE_WS_URL`. Keep the resolver process running continuously — it is the authority for explosions.
