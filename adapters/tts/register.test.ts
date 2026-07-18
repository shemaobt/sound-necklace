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

  it('real() aceita o wiring do composition root: fala com a base configurada levando o Bearer', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fakeFetch = (async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
      return { ok: false, status: 500 } as Response; // 500 é transitório: cai no fallback sem travar
    }) as unknown as typeof globalThis.fetch;

    const registration = (await import('./register')).default;
    const synth = registration.real({
      baseUrl: 'https://api.prod/api',
      token: () => 'tok-eng247',
      fetch: fakeFetch,
      AudioCtor: class {} as unknown as typeof Audio,
      createObjectURL: () => 'blob:tts',
    });
    synth.speak('Onde essa história acontece?', 'pt-BR');
    await new Promise((r) => setTimeout(r, 0));

    expect(calls[0]?.url).toBe('https://api.prod/api/platform/tts/speak');
    expect(calls[0]?.headers['authorization']).toBe('Bearer tok-eng247');
  });

  it('um 401 no speak avisa o wiring (onUnauthorized) — a sessão caducou, o app decide', async () => {
    const fakeFetch = (async () =>
      ({ ok: false, status: 401 }) as Response) as unknown as typeof globalThis.fetch;
    const expired: string[] = [];

    const registration = (await import('./register')).default;
    const synth = registration.real({
      baseUrl: 'https://api.prod/api',
      token: () => 'tok-caducado',
      fetch: fakeFetch,
      onUnauthorized: () => expired.push('401'),
      AudioCtor: class {} as unknown as typeof Audio,
      createObjectURL: () => 'blob:tts',
    });
    synth.speak('Onde essa história acontece?', 'pt-BR');
    await new Promise((r) => setTimeout(r, 0));

    expect(expired).toEqual(['401']);
  });

  it('a composição REAL cai no Web Speech quando o endpoint não existe', async () => {
    // Este é o único teste que exercita o que `register.real()` de fato entrega: o
    // HttpSpeechSynthesizer com um WebSpeechSynthesizer de verdade por dentro. Os testes do
    // http.ts injetam o fixture como fallback, cujo `stop()` só emite quando está falando,
    // enquanto o de produção emite `false` incondicionalmente.
    class FakeUtterance {
      lang = '';
      voice: SpeechSynthesisVoice | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly text: string) {}
    }
    const spoken: FakeUtterance[] = [];

    vi.stubGlobal('speechSynthesis', {
      speak: (u: FakeUtterance) => spoken.push(u),
      cancel: () => {},
      getVoices: () => [],
    });
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('Audio', class {});
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 404 } as Response));
    vi.resetModules();

    const registration = (await import('./register')).default;
    registration.real().speak('Onde essa história acontece?', 'pt-BR');
    await new Promise((r) => setTimeout(r, 0));

    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.text).toBe('Onde essa história acontece?');
    expect(spoken[0]!.lang).toBe('pt-BR');
  });
});
