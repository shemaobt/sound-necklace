import type { UiSound } from './types';

/**
 * UiSound real: osciladores Web Audio, sem um único arquivo de áudio. Os valores
 * (frequência, duração, timbre, ganho) são os do protótipo — `_blip` e seus
 * chamadores — e o envelope também: sobe em 12ms e cai exponencial, que é o que
 * faz um toque soar como toque e não como bipe de forno.
 */

/** Uma voz do vocabulário: os argumentos do `_blip` do protótipo. */
interface Tone {
  freq: number;
  dur: number;
  type: OscillatorType;
  gain: number;
}

const LOCK: Tone = { freq: 300, dur: 0.09, type: 'triangle', gain: 0.16 };
const REFUSE: Tone = { freq: 200, dur: 0.12, type: 'sawtooth', gain: 0.1 };
const TAP: Tone = { freq: 560, dur: 0.09, type: 'sine', gain: 0.1 };
const RECORD_START: Tone = { freq: 660, dur: 0.08, type: 'sine', gain: 0.12 };
const RECORD_STOP: Tone = { freq: 320, dur: 0.1, type: 'triangle', gain: 0.14 };
const SAVED: Tone = { freq: 680, dur: 0.14, type: 'sine', gain: 0.12 };
/** `_chime`: duas notas ascendentes, a segunda 90ms depois. */
const CHIME_LOW: Tone = { freq: 660, dur: 0.16, type: 'sine', gain: 0.13 };
const CHIME_HIGH: Tone = { freq: 880, dur: 0.22, type: 'sine', gain: 0.12 };
const CHIME_GAP = 0.09;

export class WebAudioUiSound implements UiSound {
  private ctx: AudioContext | null = null;

  /** O contexto é injetável para o teste ouvir o que foi agendado sem Web Audio real. */
  constructor(private readonly makeCtx: () => AudioContext = () => new AudioContext()) {}

  /**
   * O contexto nasce no primeiro toque — antes do gesto do usuário o navegador o
   * criaria suspenso (política de autoplay). Um ambiente sem Web Audio devolve
   * null e a UI simplesmente fica muda, nunca quebra.
   */
  private ensureCtx(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = this.makeCtx();
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private play(tone: Tone, delay = 0): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type;
    osc.frequency.value = tone.freq;
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(tone.gain, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + tone.dur + 0.02);
  }

  lock(): void {
    this.play(LOCK);
  }

  advance(): void {
    this.play(CHIME_LOW);
    this.play(CHIME_HIGH, CHIME_GAP);
  }

  refuse(): void {
    this.play(REFUSE);
  }

  tap(): void {
    this.play(TAP);
  }

  recordStart(): void {
    this.play(RECORD_START);
  }

  recordStop(): void {
    this.play(RECORD_STOP);
  }

  saved(): void {
    this.play(SAVED);
  }
}
