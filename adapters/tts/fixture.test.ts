import { describe, expect, it } from 'vitest';

import { FixtureSpeechSynthesizer } from './fixture';

describe('FixtureSpeechSynthesizer', () => {
  it('speak registra o texto falado e entra no estado "falando"', () => {
    const tts = new FixtureSpeechSynthesizer();
    const states: boolean[] = [];
    tts.onSpeaking((s) => states.push(s));

    tts.speak('Quem conta esta história?');

    expect(tts.spoken).toEqual([{ text: 'Quem conta esta história?', lang: 'pt-BR' }]);
    expect(states).toEqual([true]);
  });

  it('speak cancela a fala anterior antes de começar a próxima', () => {
    const tts = new FixtureSpeechSynthesizer();
    tts.speak('primeira');

    const states: boolean[] = [];
    tts.onSpeaking((s) => states.push(s));
    tts.speak('segunda');

    expect(tts.spoken.map((u) => u.text)).toEqual(['primeira', 'segunda']);
    // encerra a fala anterior (false) e inicia a próxima (true)
    expect(states).toEqual([false, true]);
  });

  it('registra o IDIOMA de cada fala — a voz segue a UI (ENG-280)', () => {
    const tts = new FixtureSpeechSynthesizer();

    tts.speak('Onde essa história acontece?');
    tts.speak('Where does this story take place?', 'en-US');

    expect(tts.spoken).toEqual([
      { text: 'Onde essa história acontece?', lang: 'pt-BR' },
      { text: 'Where does this story take place?', lang: 'en-US' },
    ]);
  });

  it('stop encerra a fala em curso', () => {
    const tts = new FixtureSpeechSynthesizer();
    tts.speak('oi');

    const states: boolean[] = [];
    tts.onSpeaking((s) => states.push(s));
    tts.stop();

    expect(states).toEqual([false]);
  });

  it('stop sem fala em curso não emite transição', () => {
    const tts = new FixtureSpeechSynthesizer();
    const states: boolean[] = [];
    tts.onSpeaking((s) => states.push(s));

    tts.stop();

    expect(states).toEqual([]);
  });

  it('a assinatura de "falando" pode ser cancelada', () => {
    const tts = new FixtureSpeechSynthesizer();
    const states: boolean[] = [];
    const off = tts.onSpeaking((s) => states.push(s));
    off();

    tts.speak('nada');

    expect(states).toEqual([]);
  });
});
