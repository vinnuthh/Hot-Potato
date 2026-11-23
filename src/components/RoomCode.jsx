import { Check, Copy, Share2 } from 'lucide-react';
import { useState } from 'react';

export default function RoomCode({ code, compact = false }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const share = async () => {
    const payload = { title: 'Join my HOT POTATO room', text: `Join my room with code ${code}` };
    try {
      if (navigator.share) await navigator.share(payload);
      else await navigator.clipboard.writeText(code);
    } catch {
      // User cancelled the share sheet.
    }
  };

  return (
    <div className={`room-code ${compact ? 'compact' : ''}`}>
      <div className="room-code-label">ROOM CODE</div>
      <div className="room-code-value">
        <span>{code}</span>
        <button type="button" className="icon-button" onClick={copy} aria-label="Copy room code">
          {copied ? <Check size={18} /> : <Copy size={18} />}
        </button>
        <button type="button" className="icon-button" onClick={share} aria-label="Share room code">
          <Share2 size={18} />
        </button>
      </div>
      {!compact && <p className="hint">Share this code with your friends. They join from the home screen.</p>}
    </div>
  );
}
