import { Flame, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { isMuted, toggleMute } from '../lib/sound';
import { useState } from 'react';

export default function GameHeader({ code, connected, muted: controlledMuted }) {
  const [localMuted, setLocalMuted] = useState(isMuted());
  const muted = controlledMuted ?? localMuted;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><Flame size={22} strokeWidth={2.6} /></span>
        <span className="brand-name">HOT POTATO</span>
      </div>
      <div className="topbar-right">
        {code && <span className="room-pill">ROOM {code}</span>}
        <span className={`connection ${connected ? 'online' : 'offline'}`} title={connected ? 'Connected' : 'Reconnecting…'}>
          {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
          <span className="connection-text">{connected ? 'LIVE' : 'RECONNECTING'}</span>
        </span>
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
