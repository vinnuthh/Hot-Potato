import { Check, Crown, Heart, Skull, Zap } from 'lucide-react';

export default function PlayerCard({
  player,
  isHolder,
  isWinner = false,
  isMe,
  canPass = false,
  onPass,
  compact = false,
}) {
  const alive = player.status === 'ALIVE';
  const classes = [
    'player-card',
    isHolder ? 'holder' : '',
    !alive ? 'eliminated' : '',
    isMe ? 'me' : '',
    compact ? 'compact' : '',
    canPass ? 'can-pass' : '',
  ].filter(Boolean).join(' ');

  const handleCardClick = () => {
    if (canPass && onPass) {
      onPass(player.id);
    }
  };

  return (
    <div
      className={classes}
      onClick={handleCardClick}
      role={canPass ? 'button' : undefined}
      tabIndex={canPass ? 0 : undefined}
      onKeyDown={(e) => {
        if (canPass && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onPass?.(player.id);
        }
      }}
    >
      <div className="player-avatar" aria-hidden="true">{player.name.slice(0, 1).toUpperCase()}</div>
      <div className="player-info">
        <div className="player-name-row">
          <span className="player-name">{player.name}</span>
          {isMe && <span className="tag tag-you">YOU</span>}
          {player.isHost && <span className="tag tag-host"><Crown size={12} /> HOST</span>}
        </div>
        <div className="player-meta">
          <span className={`status-label ${alive ? 'alive' : 'dead'}`}>
            {alive ? <><span className="dot" /> ALIVE</> : <><Skull size={12} /> ELIMINATED</>}
          </span>
          <span className="lives" title={`${player.lives} lives`}>
            {[0, 1, 2].map((index) => (
              <Heart key={index} size={13} fill={index < player.lives ? 'currentColor' : 'none'} className={index < player.lives ? 'full' : 'empty'} />
            ))}
          </span>
        </div>
      </div>
      <div className="player-actions">
        {player.ready && <span className="tag tag-ready"><Check size={12} /> READY</span>}
        {isHolder && <span className="tag tag-bomb"><Zap size={12} /> BOMB</span>}
        {isWinner && <span className="tag tag-winner"><Crown size={12} /> WINNER</span>}
        {canPass && (
          <button
            type="button"
            className="pass-button"
            onClick={(e) => {
              e.stopPropagation();
              onPass?.(player.id);
            }}
          >
            PASS <Zap size={15} fill="currentColor" />
          </button>
        )}
      </div>
    </div>
  );
}
