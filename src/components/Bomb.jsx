import { AlertTriangle, Bomb as BombIcon, Flame, Radio, Zap } from 'lucide-react';
import { AnimatePresence, m } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

export default function Bomb({
  holderName,
  active = true,
  round = 1,
  isHolder = false,
  explosion = null,
}) {
  const [multiplier, setMultiplier] = useState(1.0);
  const [crashed, setCrashed] = useState(false);
  const [crashMultiplier, setCrashMultiplier] = useState(1.0);
  const startTimeRef = useRef(Date.now());
  const roundRef = useRef(round);
  const animFrameRef = useRef(null);

  // Reset multiplier when a new round starts
  useEffect(() => {
    if (round !== roundRef.current || (active && crashed)) {
      roundRef.current = round;
      startTimeRef.current = Date.now();
      setCrashed(false);
      setMultiplier(1.0);
    }
  }, [round, active, crashed]);

  // Handle crash when round becomes inactive or explosion arrives
  useEffect(() => {
    if (!active || explosion) {
      setCrashed(true);
      setCrashMultiplier((prev) => (multiplier > 1.0 ? multiplier : prev));
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, [active, explosion, multiplier]);

  // Exponential Aviator multiplier ticker
  useEffect(() => {
    if (!active || crashed) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const tick = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      // Exponential growth curve: starts gentle, accelerates fiercely (Aviator style)
      // 3s -> ~1.4x, 6s -> ~2.2x, 10s -> ~4.1x, 15s -> ~7.8x, 20s -> ~13.5x
      const next = 1.0 + Math.pow(elapsed * 0.42, 1.72);
      setMultiplier(next);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [active, crashed, round]);

  const displayVal = crashed ? crashMultiplier.toFixed(2) : multiplier.toFixed(2);
  const currentNum = Number.parseFloat(displayVal);

  // Dynamic tension level & color
  let tensionClass = 'safe';
  let tensionLabel = 'HEATING UP';
  let color = '#3ddc8c';
  if (currentNum >= 4.0) {
    tensionClass = 'critical';
    tensionLabel = 'CRITICAL DETONATION ZONE';
    color = '#ff3b30';
  } else if (currentNum >= 2.2) {
    tensionClass = 'warning';
    tensionLabel = 'HIGH TENSION';
    color = '#ff9138';
  } else if (currentNum >= 1.4) {
    tensionClass = 'warm';
    tensionLabel = 'PRESSURE MOUNTING';
    color = '#ffd13b';
  }

  if (crashed) {
    tensionClass = 'crashed';
    tensionLabel = 'CRASHED!';
    color = '#ff3b30';
  }

  // Calculate curve progress from 0 to 1 for the SVG trajectory
  const rawProgress = Math.min((multiplier - 1.0) / 9.0, 1.0);
  const curveX = 20 + rawProgress * 300;
  const curveY = 220 - Math.pow(rawProgress, 0.8) * 160;

  // Jitter shake scale grows with multiplier
  const jitter = active && !crashed ? Math.min((currentNum - 1) * 1.4, 6) : 0;

  return (
    <div className={`bomb-stage aviator-stage ${tensionClass} ${isHolder ? 'is-me-holding' : ''}`}>
      {/* Radar Grid Backdrop */}
      <div className="aviator-grid" aria-hidden="true">
        <div className="grid-line line-1"><span className="grid-label">8.00x</span></div>
        <div className="grid-line line-2"><span className="grid-label">4.00x</span></div>
        <div className="grid-line line-3"><span className="grid-label">2.00x</span></div>
        <div className="grid-line line-4"><span className="grid-label">1.00x</span></div>
        <div className="grid-axis-v v-1" />
        <div className="grid-axis-v v-2" />
        <div className="grid-axis-v v-3" />
      </div>

      {/* SVG Flight Path Curve */}
      <svg className="aviator-svg" viewBox="0 0 360 250" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="curveGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffd13b" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#ff9138" stopOpacity="0.8" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={crashed ? '0.05' : '0.22'} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Shaded Area Under Curve */}
        <path
          d={`M 20 220 Q ${curveX * 0.5} 220, ${curveX} ${curveY} L ${curveX} 220 Z`}
          fill="url(#areaGradient)"
          className="aviator-area"
        />

        {/* Trajectory Stroke */}
        <path
          d={`M 20 220 Q ${curveX * 0.5} 220, ${curveX} ${curveY}`}
          fill="none"
          stroke="url(#curveGradient)"
          strokeWidth="3.5"
          strokeLinecap="round"
          className="aviator-path"
        />
      </svg>

      {/* Aviator Altitude / Tension Badge */}
      <div className="aviator-badge-row">
        <span className={`aviator-status-pill ${tensionClass}`}>
          <span className="beacon-dot" />
          <Radio size={12} className="pulse-icon" />
          {tensionLabel}
        </span>
        {isHolder && !crashed && (
          <span className="danger-alert-pill">
            <AlertTriangle size={13} /> YOU HAVE THE BOMB!
          </span>
        )}
      </div>

      {/* Giant Aviator Multiplier Display */}
      <div className="aviator-multiplier-wrap">
        <m.div
          className={`aviator-multiplier ${crashed ? 'is-crashed' : ''}`}
          animate={
            crashed
              ? { scale: [1, 1.15, 1], rotate: [-2, 2, 0] }
              : jitter > 0
              ? {
                  x: [-jitter, jitter, -jitter * 0.5, jitter * 0.5, 0],
                  y: [jitter * 0.5, -jitter, 0],
                }
              : {}
          }
          transition={{ duration: 0.15, repeat: active && !crashed ? Infinity : 0 }}
          style={{ color }}
        >
          {displayVal}
          <span className="mult-suffix">x</span>
        </m.div>

        {crashed ? (
          <div className="crash-banner">
            <span className="crash-tag">💥 EXPLODED AT {crashMultiplier.toFixed(2)}x</span>
          </div>
        ) : (
          <div className="danger-subline">
            <span className="fuse-text">FUSE TICKING · ACCELERATING DANGER</span>
          </div>
        )}
      </div>

      {/* Floating Bomb at trajectory peak */}
      <m.div
        className={`aviator-projectile ${crashed ? 'detonated' : ''}`}
        style={{
          left: `${Math.min(curveX, 320)}px`,
          top: `${Math.max(curveY - 24, 20)}px`,
        }}
        animate={
          crashed
            ? { scale: [1, 1.8, 0], opacity: [1, 1, 0] }
            : {
                rotate: [-6, 6, -6],
                y: [-2, 2, -2],
              }
        }
        transition={{ duration: 0.6, repeat: active && !crashed ? Infinity : 0 }}
      >
        <div className="projectile-glow" style={{ background: color }} />
        <BombIcon size={46} strokeWidth={1.8} className="projectile-bomb" />
        <span className="rocket-exhaust" />
        <span className="rocket-exhaust two" />
      </m.div>

      {/* Shockwave Blast Ring on Crash */}
      <AnimatePresence>
        {crashed && (
          <>
            <m.div
              className="blast-shockwave"
              initial={{ scale: 0.2, opacity: 1 }}
              animate={{ scale: 3.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, ease: 'easeOut' }}
            />
            <m.div
              className="blast-flash"
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Holder Caption Footer */}
      <div className="bomb-caption aviator-caption">
        <span className="eyebrow">
          {crashed ? 'ROUND CASUALTY' : isHolder ? 'IN YOUR HANDS' : 'CURRENT HOLDER'}
        </span>
        <strong className={isHolder ? 'is-me-text' : ''}>
          {holderName || '—'}
        </strong>
        <span className="fuse-note">
          {crashed
            ? 'Server resolved explosion — next flight preparing…'
            : isHolder
            ? '🔥 Pass immediately before detonation!'
            : 'Watch closely — dump the heat as soon as it lands on you'}
        </span>
      </div>
    </div>
  );
}
