// Procedural audio: no sound files needed for the prototype.
// A real release would use recorded voices (Bulgarian actors) and foley.
export class Audio {
  ctx: AudioContext;
  master: GainNode;
  private noiseBuf: AudioBuffer;
  private din: GainNode;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // wind
    this.loopNoise(0.12, 400, 0.6);
    // battle din (crowd roar), volume driven by the fight
    this.din = this.loopNoise(0, 700, 0.8);
  }

  private loopNoise(gain: number, freq: number, q: number): GainNode {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master); src.start();
    return g;
  }

  setDin(level: number) { this.din.gain.setTargetAtTime(Math.min(0.5, level), this.ctx.currentTime, 0.5); }

  private burst(dur: number, freq: number, gain: number, delay = 0, q = 1) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  horn(delay = 0, pitch = 1) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(110 * pitch, t); o.frequency.linearRampToValueAtTime(146 * pitch, t + 0.4);
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.3); g.gain.setValueAtTime(0.25, t + 1.6); g.gain.linearRampToValueAtTime(0, t + 2.2);
    o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 2.3);
  }

  /** The army answers the general: a swelling roar. */
  cheer(delay = 0.6) { for (let i = 0; i < 5; i++) this.burst(2.2, 300 + i * 160, 0.22, delay + i * 0.08, 0.7); }

  /** The general's own shout: a short, loud vocal-band burst under the voice. */
  shout() { this.burst(1.0, 650, 0.35, 0, 2); }

  volley() { this.burst(1.4, 2200, 0.25, 0, 0.6); }
  clang() { this.burst(0.12, 2500 + Math.random() * 2000, 0.15, 0, 8); }
  hoof(gain: number) { this.burst(0.08, 180, gain, 0, 3); }

  speak(text: string) {
    const synth = window.speechSynthesis; if (!synth) return;
    const voice = synth.getVoices().find(v => v.lang.toLowerCase().startsWith("bg"));
    if (!voice) return; // only speak when a Bulgarian voice exists
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice; u.lang = voice.lang; u.pitch = 0.5; u.rate = 0.8; u.volume = 1;
    synth.cancel(); synth.speak(u);
  }
}
