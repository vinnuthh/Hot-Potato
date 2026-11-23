import { ArrowRight, Flame, Gamepad2, LogIn, Plus, ShieldCheck, Timer, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameHeader from '../components/GameHeader';
import { api, getSession, saveSession } from '../lib/api';

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState('create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = getSession();

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = mode === 'create' ? await api.createRoom(name) : await api.joinRoom(code.trim().toUpperCase(), name);
      saveSession({ code: result.code, playerId: result.playerId, token: result.token, name: name.trim() });
      navigate(`/room/${result.code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page home-page">
      <GameHeader />
      <main className="home-grid">
        <section className="hero">
          <div className="hero-badge"><Flame size={15} /> REAL-TIME PARTY GAME · 2–10 PLAYERS</div>
          <h1>
            <span>HOT</span>
            <span className="outline">POTATO</span>
          </h1>
          <p className="hero-copy">
            The bomb is passed. The fuse is hidden. Nobody knows when it blows.
            Keep your cool, dump the bomb on someone else, and be the last player standing.
          </p>
          <div className="how-to">
            <div className="how-item"><Timer size={19} /><div><strong>Unpredictable fuse</strong><span>5–30 seconds, never shown to players</span></div></div>
            <div className="how-item"><Gamepad2 size={19} /><div><strong>Pass to survive</strong><span>Tap a player to hand over the bomb</span></div></div>
            <div className="how-item"><ShieldCheck size={19} /><div><strong>Fair by design</strong><span>The server decides every explosion</span></div></div>
          </div>
        </section>

        <section className="join-panel">
          <div className="panel-heading">
            <span className="eyebrow">READY TO PLAY?</span>
            <h2>Enter the room</h2>
          </div>
          <div className="mode-switch" role="tablist" aria-label="Room action">
            <button type="button" role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'active' : ''} onClick={() => { setMode('create'); setError(''); }}>
              <Plus size={16} /> Create room
            </button>
            <button type="button" role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'active' : ''} onClick={() => { setMode('join'); setError(''); }}>
              <LogIn size={16} /> Join room
            </button>
          </div>
          <form onSubmit={submit} className="join-form">
            {mode === 'join' && (
              <label className="field">
                <span>ROOM CODE</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                  placeholder="ABC23"
                  autoComplete="off"
                  maxLength={5}
                  required
                />
              </label>
            )}
            <label className="field">
              <span>DISPLAY NAME</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Blaze"
                minLength={2}
                maxLength={16}
                autoComplete="nickname"
                required
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? 'Working…' : mode === 'create' ? 'Create room' : 'Join room'} <ArrowRight size={18} />
            </button>
          </form>
          {existing && (
            <button type="button" className="text-button" onClick={() => navigate(`/room/${existing.code}`)}>
              <Users size={15} /> Resume your session in room {existing.code}
            </button>
          )}
          <p className="panel-footnote">No download needed. Works on phones and desktops.</p>
        </section>
      </main>
    </div>
  );
}
