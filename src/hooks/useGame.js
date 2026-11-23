import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, clearSession, connectGameSocket, getSession, saveSession } from '../lib/api';
import { sound } from '../lib/sound';

export function useGame(code) {
  const [session, setSession] = useState(() => getSession());
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [explosion, setExplosion] = useState(null);
  const explosionTimer = useRef(null);
  const lastVersion = useRef(null);

  const validSession = session?.code === code ? session : null;

  useEffect(() => {
    if (!validSession) {
      setError('You need to join this room first.');
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    api
      .getState(code, validSession)
      .then((next) => {
        if (!active) return;
        setState((current) => {
          if (current?.game && next?.game && (current.game.version ?? 0) > (next.game.version ?? 0)) {
            return current;
          }
          return next;
        });
        lastVersion.current = next.game?.version ?? null;
        setError(null);
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          if (err.message.includes('not found') || err.message.includes('expired')) {
            clearSession();
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const disconnect = connectGameSocket({
      code,
      playerId: validSession.playerId,
      token: validSession.token,
      onState: (next) => setState(next),
      onConnection: setConnected,
      onExplosion: (payload) => {
        setExplosion(payload);
        sound.explosion();
        clearTimeout(explosionTimer.current);
        explosionTimer.current = setTimeout(() => setExplosion(null), 2600);
      },
    });

    return () => {
      active = false;
      disconnect();
      clearTimeout(explosionTimer.current);
    };
  }, [code, validSession]);

  // Play a short sound when the server confirms a pass or a new round.
  useEffect(() => {
    const version = state?.game?.version;
    if (version == null) return;
    if (lastVersion.current != null && version !== lastVersion.current) {
      const lastEvent = state.game.lastEvent;
      if (lastEvent?.type === 'PASS') sound.pass();
      else if (lastEvent?.type === 'ROUND_START') sound.tick();
    }
    lastVersion.current = version;
  }, [state]);

  const run = useCallback(
    async (fn) => {
      if (!validSession) throw new Error('Session expired. Rejoin the room.');
      try {
        const next = await fn(validSession);
        if (next && next.code) setState(next);
        setError(null);
        return next;
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [validSession],
  );

  const actions = useMemo(
    () => ({
      ready: (ready) => run((session) => api.ready(code, session, ready)),
      start: () => run((session) => api.start(code, session)),
      pass: (targetId, version) => run((session) => api.pass(code, session, targetId, version)),
      check: () => run((session) => api.check(code, session)).catch(() => undefined),
      playAgain: () => run((session) => api.playAgain(code, session)),
      leave: async () => {
        try {
          await run((session) => api.leave(code, session));
        } catch {
          // Even if server call fails, cleanly clear session locally
        } finally {
          clearSession();
          setSession(null);
        }
      },
    }),
    [code, run],
  );

  const join = useCallback(
    async (name) => {
      const result = await api.joinRoom(code, name);
      const newSession = { code: result.code, playerId: result.playerId, token: result.token, name: name.trim() };
      saveSession(newSession);
      setSession(newSession);
      setError(null);
      return result;
    },
    [code],
  );

  const me = state?.players.find((player) => player.id === validSession?.playerId) ?? null;

  return { state, me, session: validSession, loading, error, connected, explosion, actions, join };
}
