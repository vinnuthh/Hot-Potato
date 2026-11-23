import { ArrowRight, Play, Users } from 'lucide-react';
import PlayerCard from '../components/PlayerCard';
import RoomCode from '../components/RoomCode';

export default function Lobby({ code, state, me, actions }) {
  const readyCount = state.players.filter((player) => player.ready).length;
  const canStart = me?.isHost && readyCount >= 2 && state.players.length >= 2;

  return (
    <main className="page lobby-page">
      <div className="lobby-intro">
        <div>
          <span className="eyebrow">WAITING ROOM</span>
          <h1>Get ready<span className="dot-accent">.</span></h1>
          <p>Rally your friends, tap ready, then let the host start the match.</p>
        </div>
        <RoomCode code={code} />
      </div>

      <div className="lobby-body">
        <section className="panel players-panel">
          <div className="panel-title-row">
            <h2>Players</h2>
            <span className="count-pill"><Users size={14} /> {state.players.length}/{state.maxPlayers}</span>
          </div>
          <div className="player-list">
            {state.players.map((player) => (
              <PlayerCard key={player.id} player={player} isMe={player.id === me?.id} compact />
            ))}
          </div>
        </section>

        <aside className="panel lobby-side">
          <h2>Your status</h2>
          <p className="muted">Each player starts with 3 lives. The last one alive wins.</p>
          <button
            type="button"
            className={`ready-button ${me?.ready ? 'is-ready' : ''}`}
            onClick={() => actions.ready(!me.ready).catch(() => undefined)}
          >
            {me?.ready ? '✓ Ready — click to undo' : 'I’m ready'}
          </button>
          <div className="lobby-status-line">
            <span>{readyCount} of {state.players.length} ready</span>
            <div className="progress-track"><div style={{ width: `${state.players.length ? (readyCount / state.players.length) * 100 : 0}%` }} /></div>
          </div>
          {me?.isHost ? (
            <button type="button" className="primary-button" disabled={!canStart} onClick={() => actions.start().catch(() => undefined)}>
              <Play size={17} fill="currentColor" /> Start game
            </button>
          ) : (
            <div className="waiting-note">Waiting for the host to start…</div>
          )}
          {!canStart && me?.isHost && <p className="hint">Need at least 2 ready players to start.</p>}
          <button type="button" className="text-button" onClick={() => actions.leave()}>
            Leave room <ArrowRight size={14} />
          </button>
        </aside>
      </div>
    </main>
  );
}
