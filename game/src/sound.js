// THE SALTLINE — a tiny WebAudio synth: no audio files, every sound is
// an oscillator or a noise burst shaped at play time.
//
// The context is created lazily on the first user gesture (browsers refuse
// audio before one), and every effect honours the mute flag the HUD shows
// as the SOUND indicator. Pressing M toggles it.

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // Call from any click or key handler: unlocks audio on first use.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  tone(freqFrom, freqTo, dur, type = 'sine', gainPeak = 0.08, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), t0 + dur);
    gain.gain.setValueAtTime(gainPeak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, gainPeak = 0.05, freqFrom = 400, freqTo = 120) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freqFrom, t0);
    filter.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(t0);
  }

  // One method per game event; world.js queues event names and main.js
  // plays them through here, so the simulation itself stays silent.
  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'shoot':
        this.tone(920, 620, 0.07, 'square', 0.03);
        break;
      case 'hit':
        this.tone(300, 180, 0.05, 'triangle', 0.04);
        break;
      case 'die':
        this.tone(420, 70, 0.22, 'sawtooth', 0.05);
        break;
      case 'build':
        this.tone(520, 520, 0.06, 'triangle', 0.06);
        this.tone(780, 780, 0.08, 'triangle', 0.06, 0.07);
        break;
      case 'tide':
        this.noise(0.9, 0.09, 300, 900);
        break;
      case 'beaconHit':
        this.tone(140, 60, 0.3, 'sine', 0.14);
        this.noise(0.2, 0.06, 500, 150);
        break;
      case 'waveStart':
        this.tone(392, 392, 0.1, 'triangle', 0.06);
        this.tone(587, 587, 0.14, 'triangle', 0.06, 0.1);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.07, i * 0.13));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.94, 0.24, 'triangle', 0.07, i * 0.16));
        break;
      default:
        break;
    }
  }
}
