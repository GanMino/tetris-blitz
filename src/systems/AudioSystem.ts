/**
 * Audio: Kenney CC0 sample SFX (ogg/mp3, loaded from public/audio) plus a
 * looping 8-bit jingle, with a Web Audio synth fallback for environments
 * where the samples fail to load. Mute persists to localStorage.
 */
export class AudioSystem {
  private context: AudioContext | null = null;
  private unlocked = false;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private synthFallback = false;
  private bgm: HTMLAudioElement | null = null;
  private muted = localStorage.getItem('tetris-blitz-muted') === '1';

  constructor() {
    const unlock = () => {
      void this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    void this.loadSamples();
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    await this.context.resume();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.context.destination);
    this.unlocked = true;
    this.setupBgm();
  }

  /** Load Kenney CC0 samples; fall back to synthesis if they fail. */
  private async loadSamples(): Promise<void> {
    const canOgg = new Audio().canPlayType('audio/ogg').length > 0;
    const ext = canOgg ? 'ogg' : 'mp3';
    const names = ['move', 'rotate', 'softdrop', 'harddrop', 'lock', 'clear', 'powerup', 'levelup', 'tick', 'gameover', 'start', 'gold'];
    const results = await Promise.allSettled(
      names.map(async (name) => {
        const response = await fetch(`audio/${name}.${ext}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return { name, blob };
      }),
    );
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const probe = new AudioContextClass();
    let loaded = 0;
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      try {
        const buffer = await probe.decodeAudioData(await result.value.blob.arrayBuffer());
        this.buffers.set(result.value.name, buffer);
        loaded += 1;
      } catch {
        // skip corrupt sample
      }
    }
    void probe.close();
    this.synthFallback = loaded === 0;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem('tetris-blitz-muted', this.muted ? '1' : '0');
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.context.currentTime, 0.01);
    }
    if (this.bgm) this.bgm.volume = this.muted ? 0 : 0.5;
    return this.muted;
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.toggleMute();
  }

  // ---------------------------------------------------------------- helpers

  private playBuffer(name: string, peak = 1, rate = 1): void {
    if (!this.context || !this.master) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = this.context.createGain();
    gain.gain.value = peak;
    source.connect(gain).connect(this.master);
    source.start();
  }

  private tone(
    type: OscillatorType,
    fromHz: number,
    toHz: number,
    startOffset: number,
    duration: number,
    peak: number,
    destination?: AudioNode,
  ): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime + startOffset;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, fromHz), now);
    if (toHz !== fromHz) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(destination ?? this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private arpeggio(notes: number[], stepDuration: number, type: OscillatorType, peak: number): void {
    notes.forEach((hz, i) => {
      this.tone(type, hz, hz, i * stepDuration, stepDuration * 1.6, peak);
    });
  }

  // -------------------------------------------------------------------- SFX

  move(): void {
    if (this.synthFallback) this.tone('square', 210, 190, 0, 0.04, 0.05);
    else this.playBuffer('move', 0.8);
  }

  rotate(): void {
    if (this.synthFallback) this.tone('triangle', 320, 430, 0, 0.05, 0.08);
    else this.playBuffer('rotate', 0.9);
  }

  softDrop(): void {
    if (this.synthFallback) this.tone('square', 130, 110, 0, 0.03, 0.03);
    else this.playBuffer('softdrop', 0.7);
  }

  hardDrop(): void {
    if (this.synthFallback) {
      this.tone('sine', 160, 55, 0, 0.12, 0.24);
    } else this.playBuffer('harddrop', 1.1);
  }

  lock(): void {
    if (this.synthFallback) this.tone('triangle', 100, 75, 0, 0.06, 0.14);
    else this.playBuffer('lock', 0.9);
  }

  lineClear(combo: number): void {
    if (this.synthFallback) {
      const base = [523, 659, 784, 1047, 1319];
      this.arpeggio(base.slice(0, Math.min(2 + combo, base.length)), 0.055, 'square', 0.07);
    } else {
      this.playBuffer('clear', 1.1, 1 + Math.min(combo - 1, 4) * 0.08);
    }
  }

  powerUp(): void {
    if (this.synthFallback) this.arpeggio([660, 880, 1320, 1760], 0.05, 'triangle', 0.1);
    else this.playBuffer('powerup', 1);
  }

  gold(): void {
    if (this.synthFallback) this.arpeggio([880, 1109, 1319], 0.06, 'triangle', 0.1);
    else this.playBuffer('gold', 1.05);
  }

  levelUp(): void {
    if (this.synthFallback) this.tone('square', 300, 1200, 0, 0.28, 0.06);
    else this.playBuffer('levelup', 1);
  }

  tick(): void {
    if (this.synthFallback) this.tone('square', 1050, 1050, 0, 0.035, 0.045);
    else this.playBuffer('tick', 0.55);
  }

  ui(): void {
    if (this.synthFallback) this.tone('triangle', 500, 700, 0, 0.06, 0.08);
    else this.playBuffer('rotate', 0.6);
  }

  start(): void {
    if (this.synthFallback) this.arpeggio([392, 523, 659, 784], 0.07, 'square', 0.08);
    else this.playBuffer('start', 1);
  }

  gameOver(): void {
    if (this.synthFallback) {
      this.arpeggio([660, 494, 392, 262], 0.16, 'triangle', 0.12);
    } else this.playBuffer('gameover', 1);
  }

  // --------------------------------------------------------- boss / upgrades

  bossRoar(): void {
    this.tone('sawtooth', 110, 42, 0, 0.85, 0.2);
    this.tone('square', 55, 30, 0.1, 0.7, 0.16);
    this.noise(0, 0.5, 0.12, 500);
  }

  bossHit(): void {
    this.tone('square', 220, 120, 0, 0.09, 0.12);
    this.noise(0, 0.06, 0.08, 1800);
  }

  bossDeath(): void {
    this.arpeggio([392, 311, 262, 196], 0.12, 'square', 0.12);
    this.noise(0, 0.7, 0.2, 900);
    this.tone('sawtooth', 120, 30, 0.2, 0.9, 0.14);
  }

  attackWarn(): void {
    for (let i = 0; i < 3; i += 1) {
      this.tone('square', i % 2 === 0 ? 880 : 660, i % 2 === 0 ? 880 : 660, i * 0.22, 0.14, 0.1);
    }
  }

  upgrade(): void {
    this.arpeggio([523, 659, 784, 1047, 1319], 0.06, 'triangle', 0.1);
  }

  victory(): void {
    this.arpeggio([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.12, 'square', 0.1);
    this.tone('triangle', 262, 262, 0.9, 0.7, 0.1);
  }

  private noise(startOffset: number, duration: number, peak: number, lowpassHz: number): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime + startOffset;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpassHz;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
  }

  // ------------------------------------------------------------------ music

  private setupBgm(): void {
    const canOgg = new Audio().canPlayType('audio/ogg').length > 0;
    this.bgm = new Audio(`audio/bgm.${canOgg ? 'ogg' : 'mp3'}`);
    this.bgm.loop = true;
    this.bgm.volume = this.muted ? 0 : 0.5;
  }

  startMusic(): void {
    if (!this.unlocked || !this.bgm) return;
    void this.bgm.play().catch(() => {
      // Autoplay refusal — retried on next user gesture via unlock().
    });
  }

  stopMusic(): void {
    if (!this.bgm) return;
    this.bgm.pause();
    this.bgm.currentTime = 0;
  }

  dispose(): void {
    this.stopMusic();
    this.bgm = null;
    void this.context?.close();
    this.context = null;
    this.unlocked = false;
  }
}
