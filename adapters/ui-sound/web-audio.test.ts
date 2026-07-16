import { describe, expect, it, vi } from 'vitest';

import { WebAudioUiSound } from './web-audio';

/**
 * A porta UiSound sobre um AudioContext falso: o teste OUVE o que foi agendado
 * (timbre, frequência, começo e fim de cada oscilador) sem Web Audio real. O que
 * importa é o vocabulário — vozes distinguíveis entre si — e a resiliência: um
 * ambiente sem Web Audio deixa a UI muda, nunca a quebra.
 */

interface ScheduledTone {
  type: string;
  freq: number;
  start: number;
  stop: number;
}

function fakeCtx(state: AudioContextState = 'running') {
  const tones: ScheduledTone[] = [];
  const resume = vi.fn(async () => {});
  const ctx = {
    state,
    currentTime: 0,
    resume,
    destination: {},
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
    createOscillator: () => {
      const tone: ScheduledTone = { type: '', freq: 0, start: -1, stop: -1 };
      tones.push(tone);
      return {
        set type(v: string) {
          tone.type = v;
        },
        frequency: {
          set value(v: number) {
            tone.freq = v;
          },
        },
        connect: vi.fn(),
        start: (t: number) => {
          tone.start = t;
        },
        stop: (t: number) => {
          tone.stop = t;
        },
      };
    },
  };
  return { ctx: ctx as unknown as AudioContext, tones, resume };
}

describe('WebAudioUiSound — o vocabulário do protótipo', () => {
  it('cada voz tem timbre e altura próprios: travar é grave, recusar é serra, guardar é agudo', () => {
    const { ctx, tones } = fakeCtx();
    const sound = new WebAudioUiSound(() => ctx);

    sound.lock();
    sound.refuse();
    sound.saved();

    expect(tones[0]).toMatchObject({ type: 'triangle', freq: 300 });
    expect(tones[1]).toMatchObject({ type: 'sawtooth', freq: 200 });
    expect(tones[2]).toMatchObject({ type: 'sine', freq: 680 });
  });

  it('avançar de etapa são DUAS notas ascendentes, a segunda atrasada — não um bipe só', () => {
    const { ctx, tones } = fakeCtx();
    const sound = new WebAudioUiSound(() => ctx);

    sound.advance();

    expect(tones).toHaveLength(2);
    expect(tones[1]!.freq).toBeGreaterThan(tones[0]!.freq);
    expect(tones[1]!.start).toBeGreaterThan(tones[0]!.start);
  });

  it('o oscilador sempre para depois de começar — nenhuma voz fica presa tocando', () => {
    const { ctx, tones } = fakeCtx();
    const sound = new WebAudioUiSound(() => ctx);

    sound.lock();

    expect(tones[0]!.stop).toBeGreaterThan(tones[0]!.start);
  });

  it('o contexto nasce no primeiro toque, não na construção (política de autoplay)', () => {
    const { ctx } = fakeCtx();
    const make = vi.fn(() => ctx);

    const sound = new WebAudioUiSound(make);
    expect(make).not.toHaveBeenCalled();

    sound.tap();
    sound.tap();
    expect(make).toHaveBeenCalledTimes(1); // e é reaproveitado
  });

  it('um contexto suspenso é retomado — senão o primeiro toque sairia mudo', () => {
    const { ctx, resume } = fakeCtx('suspended');
    new WebAudioUiSound(() => ctx).tap();

    expect(resume).toHaveBeenCalled();
  });

  it('sem Web Audio no ambiente a UI fica muda, não quebra', () => {
    const sound = new WebAudioUiSound(() => {
      throw new Error('sem AudioContext');
    });

    expect(() => sound.lock()).not.toThrow();
  });
});
