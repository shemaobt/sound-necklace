import { describe, expect, it } from 'vitest';

import { speechSynthesisSupported, WebSpeechSynthesizer } from './web';

/** Utterance falso: captura texto/lang/voz e expõe os handlers de start/end. */
class FakeUtterance {
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

const voice = (lang: string) =>
  ({
    lang,
    name: lang,
    default: false,
    localService: true,
    voiceURI: lang,
  }) as SpeechSynthesisVoice;

function build(voices: SpeechSynthesisVoice[] = []) {
  const spoken: FakeUtterance[] = [];
  const calls = { cancel: 0 };
  const synth = {
    speak: (u: SpeechSynthesisUtterance) => spoken.push(u as unknown as FakeUtterance),
    cancel: () => {
      calls.cancel += 1;
    },
    getVoices: () => voices,
  };
  const tts = new WebSpeechSynthesizer({
    synth: synth as unknown as SpeechSynthesis,
    UtteranceCtor: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
  });
  return { tts, spoken, calls };
}

describe('WebSpeechSynthesizer', () => {
  it('speak fala o texto em pt-BR, cancelando a fala anterior antes', () => {
    const { tts, spoken, calls } = build([voice('pt-BR')]);

    tts.speak('Quem conta esta história?');

    expect(calls.cancel).toBe(1);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.text).toBe('Quem conta esta história?');
    expect(spoken[0]!.lang).toBe('pt-BR');
  });

  it('prefere uma voz pt-BR quando disponível', () => {
    const { tts, spoken } = build([voice('en-US'), voice('pt-PT'), voice('pt-BR')]);
    tts.speak('oi');
    expect(spoken[0]!.voice?.lang).toBe('pt-BR');
  });

  it('cai para uma voz pt-* quando não há pt-BR', () => {
    const { tts, spoken } = build([voice('en-US'), voice('pt-PT')]);
    tts.speak('oi');
    expect(spoken[0]!.voice?.lang).toBe('pt-PT');
  });

  it('sem voz pt deixa a voz padrão do sistema (não define voice)', () => {
    const { tts, spoken } = build([voice('en-US')]);
    tts.speak('oi');
    expect(spoken[0]!.voice).toBeNull();
  });

  it('emite as transições de "falando" nos eventos start/end do utterance', () => {
    const { tts, spoken } = build([voice('pt-BR')]);
    const states: boolean[] = [];
    tts.onSpeaking((s) => states.push(s));

    tts.speak('oi');
    spoken[0]!.onstart?.();
    spoken[0]!.onend?.();

    expect(states).toEqual([true, false]);
  });

  it('um erro do utterance encerra o estado "falando" (não trava o lip-sync)', () => {
    const { tts, spoken } = build([voice('pt-BR')]);
    const states: boolean[] = [];
    tts.onSpeaking((s) => states.push(s));

    tts.speak('oi');
    spoken[0]!.onstart?.();
    spoken[0]!.onerror?.();

    expect(states).toEqual([true, false]);
  });

  it('stop cancela a fala e sinaliza que não está mais falando', () => {
    const { tts, calls } = build([voice('pt-BR')]);
    const states: boolean[] = [];
    tts.onSpeaking((s) => states.push(s));

    tts.speak('oi');
    tts.stop();

    expect(calls.cancel).toBe(2); // um cancel no speak, outro no stop
    expect(states).toEqual([false]);
  });

  it('num ambiente sem speechSynthesis, speak é um no-op silencioso', () => {
    const tts = new WebSpeechSynthesizer();
    expect(() => tts.speak('oi')).not.toThrow();
    expect(() => tts.stop()).not.toThrow();
  });
});

describe('speechSynthesisSupported', () => {
  it('true quando o escopo tem speechSynthesis e o construtor de utterance', () => {
    expect(
      speechSynthesisSupported({ speechSynthesis: {}, SpeechSynthesisUtterance: class {} }),
    ).toBe(true);
  });

  it('false quando falta a API de síntese de fala', () => {
    expect(speechSynthesisSupported({})).toBe(false);
    expect(speechSynthesisSupported({ speechSynthesis: {} })).toBe(false);
  });
});

describe('WebSpeechSynthesizer — o idioma segue a UI (ENG-280)', () => {
  it('fala em inglês quando pedido, escolhendo uma voz inglesa', () => {
    const { tts, spoken } = build([voice('pt-BR'), voice('en-US')]);

    tts.speak('Where does this story take place?', 'en-US');

    expect(spoken[0]!.lang).toBe('en-US');
    expect(spoken[0]!.voice?.lang).toBe('en-US');
  });

  it('sem voz do idioma pedido, NÃO empresta a voz de outro idioma', () => {
    // uma voz pt-BR lendo texto inglês sai como sotaque ininteligível: melhor deixar
    // o motor escolher (voice = null) do que forçar o idioma errado.
    const { tts, spoken } = build([voice('pt-BR')]);

    tts.speak('Where does this story take place?', 'en-US');

    expect(spoken[0]!.lang).toBe('en-US');
    expect(spoken[0]!.voice).toBeNull();
  });

  it('sem idioma explícito, segue falando pt-BR (o default do MVP)', () => {
    const { tts, spoken } = build([voice('pt-BR'), voice('en-US')]);
    tts.speak('Onde essa história acontece?');
    expect(spoken[0]!.lang).toBe('pt-BR');
    expect(spoken[0]!.voice?.lang).toBe('pt-BR');
  });
});
