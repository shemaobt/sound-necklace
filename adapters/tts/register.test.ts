import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * O registro é feito em tempo de carga do módulo lendo o ambiente (feature-detect
 * §8.7): por isso cada caso reseta os módulos e importa `./register` de novo, com
 * ou sem os globais de síntese de fala presentes.
 */
describe('registro do adapter de TTS', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('num ambiente com speechSynthesis, expõe a porta "tts" com fixture e real', async () => {
    vi.stubGlobal('speechSynthesis', { speak() {}, cancel() {}, getVoices: () => [] });
    vi.stubGlobal('SpeechSynthesisUtterance', class {});
    vi.resetModules();

    const registration = (await import('./register')).default;

    expect(registration).not.toBeNull();
    expect(registration?.port).toBe('tts');
    expect(typeof registration?.fixture).toBe('function');
    expect(typeof registration?.real).toBe('function');
    // o fixture é utilizável de imediato
    expect(() => registration!.fixture().speak('oi')).not.toThrow();
  });

  it('sem speechSynthesis no ambiente, não registra a porta (default null → botão oculto)', async () => {
    vi.resetModules();

    const registration = (await import('./register')).default;

    expect(registration).toBeNull();
  });
});
