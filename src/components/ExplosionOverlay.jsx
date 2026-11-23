import { AnimatePresence, m } from 'framer-motion';
import { Zap } from 'lucide-react';

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
            <Zap size={64} fill="currentColor" />
            <span className="eyebrow">BOOM · ROUND {explosion.round}</span>
            <h2>{explosion.victimName}</h2>
            <p>{explosion.eliminated ? 'Eliminated — now spectating' : 'Lost one life'}</p>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
