import { Check, Copy, ExternalLink, Flame, Gamepad2, Heart, Mail, Shield, Sparkles, Timer, Trophy, X } from 'lucide-react';
import { AnimatePresence, m } from 'framer-motion';
import { useState } from 'react';

export default function AboutModal({ open, onClose }) {
  const [copied, setCopied] = useState(false);
  const email = 'vinuthkumar635@gmail.com';

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <m.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <m.div
            className="about-modal"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="about-header">
              <div className="about-brand">
                <span className="brand-mark small">
                  <Flame size={18} strokeWidth={2.8} />
                </span>
                <div>
                  <h3>HOT POTATO</h3>
                  <span className="about-subtitle">Multiplayer Survival Party Game</span>
                </div>
              </div>
              <button
                type="button"
                className="icon-button modal-close"
                onClick={onClose}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="about-body">
              {/* Creator Card */}
              <section className="creator-card">
                <div className="creator-badge">
                  <Sparkles size={14} /> CREATOR & DEVELOPER
                </div>
                <div className="creator-content">
                  <div className="creator-avatar">V</div>
                  <div className="creator-details">
                    <h2 className="creator-name">Vinuth</h2>
                    <p className="creator-role">Full-Stack Game Developer</p>
                    <div className="creator-contacts">
                      <a
                        href={`mailto:${email}`}
                        className="contact-pill primary"
                        title="Send email"
                      >
                        <Mail size={14} /> {email}
                      </a>
                      <button
                        type="button"
                        className="contact-pill copy"
                        onClick={copyEmail}
                        title="Copy email to clipboard"
                      >
                        {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="creator-links">
                  <a
                    href="https://github.com/vinnuthh/Hot-Potato"
                    target="_blank"
                    rel="noreferrer"
                    className="creator-link"
                  >
                    <span>View GitHub Repository</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              </section>

              {/* Game Rules */}
              <section className="about-section">
                <h4>HOW THE GAME WORKS</h4>
                <div className="rules-grid">
                  <div className="rule-item">
                    <Timer size={18} className="rule-icon timer" />
                    <div>
                      <strong>Hidden Fuse</strong>
                      <p>Explosion deadline is randomized between 5–30s on the trusted server. Nobody knows when it will detonate.</p>
                    </div>
                  </div>
                  <div className="rule-item">
                    <Gamepad2 size={18} className="rule-icon pass" />
                    <div>
                      <strong>Pass To Survive</strong>
                      <p>Whoever holds the bomb when time expires loses a life. Tap any player card to pass the bomb instantly.</p>
                    </div>
                  </div>
                  <div className="rule-item">
                    <Heart size={18} className="rule-icon heart" />
                    <div>
                      <strong>3 Lives Each</strong>
                      <p>All players start with 3 lives. Lose all 3 to become an eliminated spectator.</p>
                    </div>
                  </div>
                  <div className="rule-item">
                    <Trophy size={18} className="rule-icon trophy" />
                    <div>
                      <strong>Last Player Wins</strong>
                      <p>Outlast everyone else to take home the crown and claim survival victory!</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Tech Highlights */}
              <section className="about-section tech-section">
                <h4>TECH ARCHITECTURE</h4>
                <div className="tech-tags">
                  <span className="tech-tag"><Shield size={12} /> Server-Authoritative Clock</span>
                  <span className="tech-tag">⚡ Low-Latency WebSockets</span>
                  <span className="tech-tag">⚛️ React 19 + Framer Motion</span>
                  <span className="tech-tag">🛡️ SHA-256 Token Auth</span>
                  <span className="tech-tag">☁️ Vercel + Render Cloud</span>
                </div>
              </section>
            </div>

            <div className="about-footer">
              <span>Made with 🔥 by Vinuth</span>
              <button type="button" className="secondary-button close-btn" onClick={onClose}>
                Close
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
