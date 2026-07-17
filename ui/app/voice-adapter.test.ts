import { describe, expect, it } from 'vitest';

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
