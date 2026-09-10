/**
 * Web Audio synthesizer: 8-bit arcade SFX plus a looping chiptune backing
 * track, all generated at runtime — no external assets. Mute persists to
 * localStorage and stops the music scheduler.
 */
export class AudioSystem {
  private context: AudioContext | null = null;
  private unlocked = false;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  private muted = localStorage.getItem('tetris-blitz-muted') === '1';

  constructor() {
    const unlock = () => {
      void this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
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
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);
    this.unlocked = true;
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
    return this.muted;
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.toggleMute();
  }

  // ---------------------------------------------------------------- helpers

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

  private arpeggio(notes: number[], stepDuration: number, type: OscillatorType, peak: number): void {
    notes.forEach((hz, i) => {
      this.tone(type, hz, hz, i * stepDuration, stepDuration * 1.6, peak);
    });
  }

  // -------------------------------------------------------------------- SFX

  move(): void {
    this.tone('square', 210, 190, 0, 0.04, 0.05);
  }

  rotate(): void {
    this.tone('triangle', 320, 430, 0, 0.05, 0.08);
  }

  softDrop(): void {
    this.tone('square', 130, 110, 0, 0.03, 0.03);
  }

  hardDrop(): void {
    this.noise(0, 0.09, 0.16, 700);
    this.tone('sine', 160, 55, 0, 0.12, 0.24);
  }

  lock(): void {
    this.tone('triangle', 100, 75, 0, 0.06, 0.14);
    this.noise(0, 0.04, 0.05, 900);
  }

  lineClear(combo: number): void {
    const base = [523, 659, 784, 1047, 1319];
    const notes = base.slice(0, Math.min(2 + combo, base.length));
    this.arpeggio(notes, 0.055, 'square', 0.07);
    this.noise(0, 0.16, 0.08, 2400);
  }

  powerUp(): void {
    this.arpeggio([660, 880, 1320, 1760], 0.05, 'triangle', 0.1);
  }

  levelUp(): void {
    this.tone('square', 300, 1200, 0, 0.28, 0.06);
    this.tone('square', 600, 2400, 0.12, 0.28, 0.04);
  }

  tick(): void {
    this.tone('square', 1050, 1050, 0, 0.035, 0.045);
  }

  ui(): void {
    this.tone('triangle', 500, 700, 0, 0.06, 0.08);
  }

  start(): void {
    this.arpeggio([392, 523, 659, 784], 0.07, 'square', 0.08);
  }

  gameOver(): void {
    this.arpeggio([660, 494, 392, 262], 0.16, 'triangle', 0.12);
    this.tone('sawtooth', 130, 45, 0.1, 0.7, 0.05);
  }

  // ------------------------------------------------------------------ music

  startMusic(): void {
    if (!this.context || !this.musicGain || this.musicTimer !== null) return;
    this.step = 0;
    this.nextStepTime = this.context.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleMusic(): void {
    if (!this.context || !this.musicGain) return;
    const stepDuration = 60 / 152 / 2; // 152 BPM, 8th notes
    const bassLine = [65.4, 0, 98, 0, 65.4, 0, 82.4, 98, 55, 0, 82.4, 0, 55, 0, 73.4, 82.4];
    const leadLine = [
      523, 0, 659, 0, 784, 0, 659, 0, 523, 0, 659, 0, 784, 0, 1047, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 392, 0, 494, 0, 523, 0, 659, 0,
    ];
    while (this.nextStepTime < this.context.currentTime + 0.22) {
      // Skip backlog after a throttled/backgrounded interval instead of
      // scheduling a burst of past-start notes.
      if (this.nextStepTime < this.context.currentTime - 0.05) {
        this.nextStepTime = this.context.currentTime;
        this.step += 1;
        continue;
      }
      const stepIndex = this.step % 32;
      const bass = bassLine[stepIndex % 16];
      const lead = leadLine[stepIndex];
      if (bass > 0) {
        this.tone('square', bass, bass, this.nextStepTime - this.context.currentTime, stepDuration * 0.9, 0.16, this.musicGain);
      }
      if (lead > 0) {
        this.tone('square', lead, lead, this.nextStepTime - this.context.currentTime, stepDuration * 1.7, 0.07, this.musicGain);
      }
      this.nextStepTime += stepDuration;
      this.step += 1;
    }
  }

  dispose(): void {
    this.stopMusic();
    void this.context?.close();
    this.context = null;
    this.unlocked = false;
  }
}
