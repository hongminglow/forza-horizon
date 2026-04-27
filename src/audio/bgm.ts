type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const MASTER_VOLUME = 0.22;
const BEAT_SECONDS = 0.42;
const SCHEDULE_AHEAD_SECONDS = 0.9;
const NOTES = [196, 246.94, 293.66, 329.63, 293.66, 246.94, 220, 246.94];
const BASS_NOTES = [98, 98, 123.47, 123.47, 146.83, 146.83, 123.47, 110];

export class ProceduralBgm {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private schedulerId: number | null = null;
  private nextBeatTime = 0;
  private step = 0;
  private volume = 0.45;
  private muted = false;
  private enabled = true;
  private lastCrashTime = 0;

  async unlock(): Promise<void> {
    const context = this.getContext();
    await context.resume();

    if (this.enabled) {
      this.startScheduler();
    }
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (!enabled) {
      this.stopScheduler();
      return;
    }

    if (this.context && this.context.state === "running") {
      this.startScheduler();
    }
  }

  destroy(): void {
    this.stopScheduler();
    void this.context?.close();
    this.context = null;
    this.masterGain = null;
  }

  playCrash(strength: number): void {
    const context = this.getContext();
    const now = context.currentTime;

    if (now - this.lastCrashTime < 0.14) {
      return;
    }

    this.lastCrashTime = now;
    void context.resume();

    if (!this.masterGain) {
      return;
    }

    const intensity = Math.min(1, Math.max(0.15, strength));
    const noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.16), context.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    }

    const noise = context.createBufferSource();
    const noiseGain = context.createGain();
    noise.buffer = noiseBuffer;
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.24 * intensity, now + 0.012);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    noise.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.18);

    this.playTone(64 + intensity * 38, now, 0.18, "sawtooth", 0.12 * intensity);
  }

  private getContext(): AudioContext {
    if (this.context) {
      return this.context;
    }

    const AudioContextConstructor =
      window.AudioContext ?? (window as AudioWindow).webkitAudioContext;

    if (!AudioContextConstructor) {
      throw new Error("Web Audio is not supported in this browser");
    }

    this.context = new AudioContextConstructor();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.applyGain();
    this.nextBeatTime = this.context.currentTime + 0.08;
    return this.context;
  }

  private startScheduler(): void {
    if (this.schedulerId !== null || !this.enabled || !this.context) {
      return;
    }

    this.schedulerId = window.setInterval(() => this.schedule(), 90);
    this.schedule();
  }

  private stopScheduler(): void {
    if (this.schedulerId === null) {
      return;
    }

    window.clearInterval(this.schedulerId);
    this.schedulerId = null;
  }

  private schedule(): void {
    if (!this.context || !this.masterGain || !this.enabled) {
      return;
    }

    while (this.nextBeatTime < this.context.currentTime + SCHEDULE_AHEAD_SECONDS) {
      const note = NOTES[this.step % NOTES.length];
      const bassNote = BASS_NOTES[this.step % BASS_NOTES.length];

      this.playTone(note, this.nextBeatTime, BEAT_SECONDS * 0.82, "triangle", 0.08);

      if (this.step % 2 === 0) {
        this.playTone(bassNote, this.nextBeatTime, BEAT_SECONDS * 1.42, "sine", 0.075);
      }

      if (this.step % 4 === 2) {
        this.playTone(
          note * 1.5,
          this.nextBeatTime + BEAT_SECONDS * 0.52,
          BEAT_SECONDS * 0.36,
          "sine",
          0.035,
        );
      }

      this.nextBeatTime += BEAT_SECONDS;
      this.step += 1;
    }
  }

  private playTone(
    frequency: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
  ): void {
    if (!this.context || !this.masterGain) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.detune.setValueAtTime(Math.sin(this.step * 1.7) * 4, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.04);
  }

  private applyGain(): void {
    if (!this.context || !this.masterGain) {
      return;
    }

    const targetGain = this.muted ? 0.0001 : Math.max(0.0001, this.volume ** 2 * MASTER_VOLUME);
    this.masterGain.gain.setTargetAtTime(targetGain, this.context.currentTime, 0.04);
  }
}
