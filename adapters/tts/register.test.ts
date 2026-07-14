import { afterEach, describe, expect, it, vi } from 'vitest';

describe('registro do adapter de TTS', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('expõe a porta "tts" com fixture e real', async () => {
    const registration = (await import('./register')).default;

    expect(registration.port).toBe('tts');
    expect(typeof registration.fixture).toBe('function');
    expect(typeof registration.real).toBe('function');
    // o fixture é utilizável de imediato
    expect(() => registration.fixture().speak('oi')).not.toThrow();
  });

  it('registra a porta MESMO sem speechSynthesis: a voz vem da API, não do navegador', async () => {
    // O Web Speech virou fallback (ENG-284) — sua ausência não pode mais apagar a voz do
    // guia, senão um navegador sem síntese perderia também os clipes ElevenLabs.
    vi.resetModules();

    const registration = (await import('./register')).default;

    expect(registration.port).toBe('tts');
    expect(() => registration.real()).not.toThrow();
  });
});
