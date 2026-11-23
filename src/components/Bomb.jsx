import { Bomb as BombIcon } from 'lucide-react';
import { m } from 'framer-motion';

export default function Bomb({ holderName, active = true }) {
  return (
    <div className={`bomb-stage ${active ? 'is-live' : ''}`}>
      <m.div
        className="bomb-glow"
        animate={{ scale: active ? [1, 1.09, 1] : 1, opacity: active ? [0.45, 0.75, 0.45] : 0.2 }}
        transition={{ duration: 1.6, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
      />
      <m.div
        className="bomb-core"
        animate={active ? { rotate: [-4, 4, -4], y: [0, -6, 0] } : {}}
        transition={{ duration: 1.6, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
      >
        <BombIcon size={112} strokeWidth={1.35} />
        <span className="spark spark-one" />
        <span className="spark spark-two" />
      </m.div>
      <div className="bomb-caption">
        <span className="eyebrow">CURRENT HOLDER</span>
        <strong>{holderName || '—'}</strong>
        <span className="fuse-note">Fuse hidden · pass it on</span>
      </div>
    </div>
  );
}
