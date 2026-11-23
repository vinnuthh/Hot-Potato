import { Flame, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isMuted, toggleMute } from '../lib/sound';

export default function GameHeader({ code, connected, muted: controlledMuted }) {
  const [localMuted, setLocalMuted] = useState(isMuted());
  const muted = controlledMuted ?? localMuted;

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="brand-mark"><Flame size={22} strokeWidth={2.6} /></span>
        <span className="brand-name">HOT POTATO</span>
      </Link>
      <div className="topbar-right">
        {code && <span className="room-pill">ROOM {code}</span>}
        {code && (
          <span className={`connection ${connected ? 'online' : 'offline'}`} title={connected ? 'Connected' : 'Reconnecting…'}>
            {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span className="connection-text">{connected ? 'LIVE' : 'RECONNECTING'}</span>
          </span>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          onClick={() => {
            const next = toggleMute();
            setLocalMuted(next);
          }}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
    </header>
  );
}
