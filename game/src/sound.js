// THE SALTLINE — tiny WebAudio synth: no audio files, every sound is an
// oscillator blip shaped here. Created lazily on the first user gesture
// (browsers refuse audio before one); the screenshot scenes never call
// it, so staged frames stay silent and deterministic.

let context = null;
let muted = false;

function ensureContext() {
  if (muted) return null;
  if (context === null) {
    const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
    if (AudioCtor === undefined) return null;
    context = new AudioCtor();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

function blip(freqFrom, freqTo, seconds, type, gainPeak) {
  const ctx = ensureContext();
  if (ctx === null) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), now + seconds);
  gain.gain.setValueAtTime(gainPeak, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + seconds);
}

export const sound = {
  unlock() { ensureContext(); },
  toggleMuted() {
    muted = !muted;
    return muted;
  },
  isMuted() { return muted; },
  shoot() { blip(880, 660, 0.07, 'square', 0.05); },
  cannon() { blip(160, 60, 0.22, 'sawtooth', 0.10); },
  hit() { blip(220, 90, 0.08, 'triangle', 0.06); },
  build() { blip(520, 780, 0.10, 'triangle', 0.07); },
  tideBell() { blip(1175, 1175, 0.35, 'sine', 0.08); blip(1568, 1568, 0.4, 'sine', 0.05); },
  leak() { blip(300, 140, 0.25, 'sawtooth', 0.10); },
  win() { blip(523, 523, 0.15, 'triangle', 0.08); setTimeout(() => blip(784, 784, 0.3, 'triangle', 0.08), 130); },
  lose() { blip(392, 98, 0.7, 'triangle', 0.10); },
};
