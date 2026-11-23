import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ExplosionOverlay from '../components/ExplosionOverlay';
import GameHeader from '../components/GameHeader';
import { useGame } from '../hooks/useGame';
import { sound } from '../lib/sound';
import Game from './Game';
import Lobby from './Lobby';
import Spectator from './Spectator';
import Winner from './Winner';

export default function Room() {
  const { code } = useParams();
  const upperCode = (code ?? '').toUpperCase();
  const { state, me, loading, error, connected, explosion, actions } = useGame(upperCode);
  const navigate = useNavigate();
  const [toast, setToast] = useState('');
  const [celebrated, setCelebrated] = useState(false);

  useEffect(() => {
    if (!error) return undefined;
    setToast(error);
    const timer = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (state?.status === 'FINISHED' && !celebrated) {
      setCelebrated(true);
      sound.win();
    }
    if (state?.status === 'WAITING' || state?.status === 'PLAYING') setCelebrated(false);
  }, [state?.status, celebrated]);

  const roomActions = useMemo(
    () => ({
      ...actions,
      leave: () => actions.leave().finally(() => navigate('/')),
    }),
    [actions, navigate],
  );

  let content;
  if (loading && !state) {
    content = <div className="screen-message"><Loader2 className="spin" size={30} /><p>Connecting to room…</p></div>;
  } else if (!state || !me) {
    content = (
      <div className="screen-message">
        <AlertTriangle size={30} />
        <h1>Room unavailable</h1>
        <p>{error || 'We couldn’t find that room or your session expired.'}</p>
        <Link to="/" className="primary-button"><ArrowLeft size={16} /> Back to home</Link>
      </div>
    );
  } else if (state.status === 'WAITING') {
    content = <Lobby code={upperCode} state={state} me={me} actions={roomActions} />;
  } else if (state.status === 'FINISHED') {
    content = <Winner state={state} me={me} actions={roomActions} />;
  } else if (me.status === 'ELIMINATED') {
    content = <Spectator state={state} me={me} />;
  } else {
    content = <Game state={state} me={me} actions={actions} />;
  }

  return (
    <div className="page room-page">
      <GameHeader code={upperCode} connected={connected} />
      {content}
      {toast && state && <div className="toast"><AlertTriangle size={16} /> {toast}</div>}
      <ExplosionOverlay explosion={explosion} />
    </div>
  );
}
