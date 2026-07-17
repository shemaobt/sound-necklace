import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ResourcePath } from '../../contracts';
import { voiceStoreFor } from './voice-adapter';

const PATH = 'respostas/level1/recontar.webm' as ResourcePath;

describe('voiceStoreFor — as respostas de voz são POR SESSÃO (§10.4)', () => {
  it('sessões diferentes têm armazéns diferentes: gravar numa não aparece na outra', async () => {
    const a = voiceStoreFor('sessao-a');
    const b = voiceStoreFor('sessao-b');
    await a.put(PATH, new Uint8Array([1, 2, 3]));

    expect(await a.has(PATH)).toBe(true);
    expect(await b.has(PATH)).toBe(false);
  });

  it('voltar à mesma sessão reencontra o mesmo armazém (bytes preservados na aba)', async () => {
    const antes = voiceStoreFor('sessao-volta');
    await antes.put(PATH, new Uint8Array([9]));

    const depois = voiceStoreFor('sessao-volta');
    expect(depois).toBe(antes);
    expect(await depois.has(PATH)).toBe(true);
  });
});

describe('voiceStoreFor — modo real liga aos recursos da sessão (ENG-247)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('VITE_API_MODE=real devolve o SessionVoiceStore (persistência no tripod-api)', async () => {
    vi.stubEnv('VITE_API_MODE', 'real');
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.prod/api');
    vi.resetModules();
    const { voiceStoreFor: realFor } = await import('./voice-adapter');
    const { SessionVoiceStore } = await import('../../adapters/voice/session-store');
    const { MemoryVoiceStore } = await import('../../adapters/voice/memory-store');
    expect(realFor('sessao-x')).toBeInstanceOf(SessionVoiceStore);
    // fora de sessão não há namespace de recursos — cai no armazém em memória
    expect(realFor(null)).toBeInstanceOf(MemoryVoiceStore);
  });
});
