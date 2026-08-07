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

  it('VITE_API_MODE=real persiste no tripod-api, por trás do cache de áudio', async () => {
    vi.stubEnv('VITE_API_MODE', 'real');
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.prod/api');
    vi.resetModules();
    const { voiceStoreFor: realFor } = await import('./voice-adapter');
    const { CachedVoiceStore } = await import('../../adapters/voice/cached-store');
    const { MemoryVoiceStore } = await import('../../adapters/voice/memory-store');
    // o armazém real ganhou uma camada: os bytes continuam indo para a API, e o
    // cache é o que evita baixá-los de novo a cada reabertura da sessão
    expect(realFor('sessao-x')).toBeInstanceOf(CachedVoiceStore);
    // fora de sessão não há namespace de recursos — cai no armazém em memória, que
    // já É um cache e não ganha outro por cima
    expect(realFor(null)).toBeInstanceOf(MemoryVoiceStore);
  });
});
