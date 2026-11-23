import { AnimatePresence, m } from 'framer-motion';
import { Flame, Skull, Zap } from 'lucide-react';

export default function ExplosionOverlay({ explosion }) {
  return (
    <AnimatePresence>
      {explosion && (
        <m.div
          className="explosion-overlay aviator-crash-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Expanding shockwaves */}
          <div className="crash-shockwave-ring ring-1" />
          <div className="crash-shockwave-ring ring-2" />

          <m.div
            className="explosion-card aviator-crash-card"
            initial={{ scale: 0.5, rotate: -6 }}
            animate={{ scale: [0.5, 1.08, 1], rotate: [-6, 2, 0] }}
            exit={{ scale: 1.25, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          >
            <div className="crash-icon-wrap">
              <Zap size={60} fill="currentColor" className="crash-zap" />
              <Flame size={32} className="crash-fire" />
            </div>
            <span className="eyebrow crash-eyebrow">
              💥 BLAST CRASH · ROUND {explosion.round}
            </span>
            <h2 className="crash-victim">{explosion.victimName}</h2>
            <div className="crash-status-pill">
              {explosion.eliminated && <Skull size={15} />}
              <span>
                {explosion.matchFinished
                  ? 'Final elimination — match complete!'
                  : explosion.eliminated
                  ? 'Eliminated — now spectating'
                  : 'Detonated! Lost 1 life'}
              </span>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
