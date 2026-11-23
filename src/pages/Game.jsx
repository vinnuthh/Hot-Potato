import { AlertTriangle, Heart, Radio, Users } from 'lucide-react';
import Bomb from '../components/Bomb';
import PlayerCard from '../components/PlayerCard';

export default function Game({ state, me, actions }) {
  const game = state.game;
  const holder = state.players.find((player) => player.id === game.holderId);
  const isHolder = game.holderId === me.id;
  const isResolving = game.status !== 'ACTIVE';
  const targets = state.players.filter((player) => player.id !== me.id && player.status === 'ALIVE');

  const passTo = (targetId) => {
    actions.pass(targetId, game.version).catch(() => undefined);
  };

  return (
    <main className="page game-page">
      <div className="game-toprow">
        <div className="round-indicator"><span>ROUND</span><strong>{String(game.round).padStart(2, '0')}</strong></div>
        <div className="game-status">
          <span className="status-chip"><Radio size={14} /> LIVE MATCH</span>
          <span className="status-chip"><Users size={14} /> {game.activeCount} ACTIVE</span>
          <span className="status-chip lives-chip"><Heart size={14} fill="currentColor" /> {me.lives} LIVES</span>
        </div>
      </div>

      <div className="game-main">
        <Bomb holderName={holder?.name} active={!isResolving} />

        <section className="panel pass-panel">
          <div className="pass-panel-head">
            <div>
              <span className="eyebrow">{isHolder ? 'YOUR MOVE' : 'STAY SHARP'}</span>
              <h2>{isHolder ? 'Pass the bomb' : 'You don’t have it'}</h2>
            </div>
            {isHolder && <span className="holder-flag"><AlertTriangle size={14} /> HOLDING</span>}
          </div>

          {isHolder ? (
            <>
              <p className="muted">Tap a player to pass it on. The fuse is hidden — don’t wait too long.</p>
              <div className="target-list">
                {targets.map((player) => (
                  <PlayerCard key={player.id} player={player} isHolder={player.id === game.holderId} isMe={player.id === me.id} canPass={!isResolving} onPass={passTo} compact />
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="muted">{holder?.name ?? 'Another player'} is holding the bomb. Watch the room and get ready — it could land on you next.</p>
              <div className="target-list">
                {state.players.filter((player) => player.status === 'ALIVE').map((player) => (
                  <PlayerCard key={player.id} player={player} isHolder={player.id === game.holderId} isMe={player.id === me.id} compact />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
      {isResolving && <div className="round-break">Boom! Server is resolving the round…</div>}
    </main>
  );
}
