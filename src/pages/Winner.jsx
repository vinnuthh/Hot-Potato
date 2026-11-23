import { ArrowRight, Crown, RotateCcw, Trophy } from 'lucide-react';
import { m } from 'framer-motion';
import PlayerCard from '../components/PlayerCard';

export default function Winner({ state, me, actions }) {
  const winner = state.players.find((player) => player.id === state.game.winnerId);
  const isWinner = winner?.id === me.id;
  const standings = [...state.players].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ALIVE' ? -1 : 1;
    if (a.status === 'ALIVE') return b.lives - a.lives;
    return (a.eliminatedAt ?? 0) - (b.eliminatedAt ?? 0);
  });

  return (
    <main className="page winner-page">
      <m.div className="winner-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
        <m.div className="trophy" initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, delay: 0.15 }}>
          <Trophy size={58} fill="currentColor" />
        </m.div>
        <span className="eyebrow">MATCH COMPLETE · {state.game.round} ROUNDS</span>
        <h1>{isWinner ? 'You survived!' : `${winner?.name ?? 'Nobody'} wins!`}</h1>
        <p className="muted">
          {isWinner ? 'Last player standing. Nobody could take the heat.' : 'Better luck next round — keep passing that bomb.'}
        </p>
        <div className="winner-actions">
          {me.isHost ? (
            <button type="button" className="primary-button" onClick={() => actions.playAgain().catch(() => undefined)}>
              <RotateCcw size={17} /> Play again
            </button>
          ) : (
            <div className="waiting-note">Waiting for the host to start a new match…</div>
          )}
          <button type="button" className="secondary-button" onClick={() => actions.leave()}>
            Return home <ArrowRight size={16} />
          </button>
        </div>
      </m.div>

      <section className="panel standings-panel">
        <div className="panel-title-row"><h2>Final standings</h2><span className="count-pill"><Crown size={14} /> {winner?.name}</span></div>
        <div className="player-list">
          {standings.map((player, index) => (
            <div key={player.id} className="standing-row">
              <span className="rank">#{index + 1}</span>
              <PlayerCard player={player} isMe={player.id === me.id} isHolder={player.id === winner?.id} compact />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
