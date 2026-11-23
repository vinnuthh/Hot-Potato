import { Eye, Heart, LogOut, Skull, Users } from 'lucide-react';
import Bomb from '../components/Bomb';
import PlayerCard from '../components/PlayerCard';

export default function Spectator({ state, me, actions }) {
  const game = state.game;
  const holder = state.players.find((player) => player.id === game?.holderId);

  return (
    <main className="page spectator-page">
      <div className="spectator-banner">
        <Eye size={20} />
        <div>
          <strong>You’re eliminated — spectating</strong>
          <span>You can watch the rest of the match, but you can’t pass or receive the bomb.</span>
        </div>
      </div>

      <div className="game-main">
        <Bomb holderName={holder?.name} active={game?.status === 'ACTIVE'} />
        <section className="panel pass-panel">
          <div className="pass-panel-head">
            <div><span className="eyebrow">ROUND {game?.round ?? 1}</span><h2>Remaining players</h2></div>
            <span className="status-chip"><Users size={14} /> {game?.activeCount ?? 0} ACTIVE</span>
          </div>
          <div className="target-list">
            {state.players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                isHolder={player.id === game?.holderId}
                isMe={player.id === me.id}
                compact
              />
            ))}
          </div>
          <p className="hint"><Skull size={13} /> Spectators have no controls. <Heart size={13} /> Lives shown for remaining players.</p>
          <div className="spectator-actions">
            <button type="button" className="text-button" onClick={() => actions?.leave()}>
              <LogOut size={13} /> Leave match
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
