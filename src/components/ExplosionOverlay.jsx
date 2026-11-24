import { AnimatePresence, m } from 'framer-motion';
import { Flame, Zap } from 'lucide-react';

export default function ExplosionOverlay({ explosion }) {
  return (
    <AnimatePresence>
      {explosion && (
        <m.div
          className="explosion-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <m.div
            className="explosion-card"
            initial={{ scale: 0.6, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 1.2, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <div className="explosion-icon-wrap">
              <Zap size={68} fill="currentColor" />
            </div>
            <span className="eyebrow">BOOM · ROUND {explosion.round}</span>
            <h2>{explosion.victimName}</h2>
            <p className="explosion-status">
              {explosion.matchFinished
                ? 'Final elimination — Match complete!'
                : explosion.eliminated
                ? 'Eliminated — Now spectating'
                : 'Lost one life!'}
            </p>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
