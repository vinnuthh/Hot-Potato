let context = null;
let muted = localStorage.getItem('hot-potato-muted') === 'true';

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  localStorage.setItem('hot-potato-muted', String(muted));
  return muted;
}

function audio() {
  if (muted) return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  context ??= new AudioContext();
  if (context.state === 'suspended') context.resume();
  return context;
}

function tone({ frequency, duration, type = 'sine', volume = 0.07, slideTo = null, delay = 0 }) {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export const sound = {
  pass: () => tone({ frequency: 520, slideTo: 880, duration: 0.16, type: 'triangle' }),
  tick: () => tone({ frequency: 320, duration: 0.07, type: 'square', volume: 0.025 }),
  explosion: () => {
    tone({ frequency: 160, slideTo: 35, duration: 0.65, type: 'sawtooth', volume: 0.12 });
    tone({ frequency: 90, slideTo: 25, duration: 0.8, type: 'square', volume: 0.08, delay: 0.04 });
  },
  win: () => {
    [523, 659, 784, 1046].forEach((frequency, index) =>
      tone({ frequency, duration: 0.35, type: 'triangle', delay: index * 0.12 }),
    );
  },
};
