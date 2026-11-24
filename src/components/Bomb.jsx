import { AlertTriangle, Bomb as BombIcon, Flame } from 'lucide-react';
import { m } from 'framer-motion';

export default function Bomb({ holderName, active = true, isHolder = false }) {
  return (
    <div className={`bomb-stage ${active ? 'is-live' : ''} ${isHolder ? 'is-holding' : ''}`}>
      {/* Live Warning Alert when user holds the bomb */}
      {active && isHolder && (
        <m.div
          className="holder-live-alert"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Flame size={14} className="alert-flame" />
          <span>YOU HAVE THE BOMB! PASS IT QUICK!</span>
        </m.div>
      )}

      {/* Atmospheric Glowing Aura */}
      <m.div
        className="bomb-glow"
        animate={{
          scale: active ? (isHolder ? [1, 1.25, 1] : [1, 1.1, 1]) : 1,
          opacity: active ? (isHolder ? [0.6, 0.95, 0.6] : [0.4, 0.7, 0.4]) : 0.2,
        }}
        transition={{
          duration: isHolder ? 0.7 : 1.4,
          repeat: active ? Infinity : 0,
          ease: 'easeInOut',
        }}
      />

      {/* Animated Bomb Core with Sparks */}
      <m.div
        className="bomb-core"
        animate={
          active
            ? {
                rotate: isHolder ? [-8, 8, -8] : [-4, 4, -4],
                y: isHolder ? [0, -10, 0] : [0, -6, 0],
                scale: isHolder ? [1, 1.05, 1] : 1,
              }
            : {}
        }
        transition={{
          duration: isHolder ? 0.5 : 1.5,
          repeat: active ? Infinity : 0,
          ease: 'easeInOut',
        }}
      >
        <BombIcon size={116} strokeWidth={1.35} />
        <span className="spark spark-one" />
        <span className="spark spark-two" />
        {isHolder && <span className="spark spark-three" />}
      </m.div>

      {/* Caption & Current Holder Indicator */}
      <div className="bomb-caption">
        <span className="eyebrow">
          {isHolder ? 'IN YOUR HANDS' : 'CURRENT HOLDER'}
        </span>
        <strong className={isHolder ? 'holder-highlight' : ''}>
          {holderName || '—'}
        </strong>
        <span className="fuse-note">
          {isHolder
            ? '🔥 Tap any player below to pass immediately!'
            : 'Unpredictable fuse ticking · Be ready to receive!'}
        </span>
      </div>
    </div>
  );
}
