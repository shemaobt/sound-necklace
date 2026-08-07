import { describe, expect, it, vi } from 'vitest';

import type { ResourcePath } from '../../contracts';

import { CachedVoiceStore, type AudioCache } from './cached-store';
import type { VoiceResourceStore } from './types';

const P1 = 'respostas/level1/recontar.webm' as ResourcePath;
const P2 = 'respostas/level2/PT1/quem.webm' as ResourcePath;
const BYTES = new Uint8Array([1, 2, 3]);

/**
 * Cache de verdade, só que em memória: um dublê que MENTE não provaria nada aqui,
 * porque o que está sob teste é justamente quando o armazém de baixo é poupado.
 */
function memoryCache(): AudioCache & { entries: Map<string, Uint8Array> } {
  const entries = new Map<string, Uint8Array>();
  return {
    entries,
    get: (k) => Promise.resolve(entries.get(k) ?? null),
    put: (k, bytes) => {
      entries.set(k, bytes);
      return Promise.resolve();
    },
    delete: (k) => {
      entries.delete(k);
      return Promise.resolve();
    },
    clearSession: (id) => {
      for (const k of [...entries.keys()]) if (k.startsWith(`${id}/`)) entries.delete(k);
      return Promise.resolve();
    },
  };
}

function innerStore(seed: Record<string, Uint8Array> = {}): VoiceResourceStore {
  const bytes = new Map(Object.entries(seed));
  return {
    put: vi.fn((p: ResourcePath, b: Uint8Array) => {
      bytes.set(p, b);
      return Promise.resolve();
    }),
    get: vi.fn((p: ResourcePath) => {
      const hit = bytes.get(p);
      return hit ? Promise.resolve(hit) : Promise.reject(new Error(`sem ${p}`));
    }),
    has: vi.fn((p: ResourcePath) => Promise.resolve(bytes.has(p))),
    delete: vi.fn((p: ResourcePath) => {
      bytes.delete(p);
      return Promise.resolve();
    }),
  };
}

describe('CachedVoiceStore — o áudio não é baixado duas vezes', () => {
  it('a segunda leitura não volta ao armazém', async () => {
    const inner = innerStore({ [P1]: BYTES });
    const store = new CachedVoiceStore(inner, memoryCache(), 's-1');

    const first = await store.get(P1);
    const second = await store.get(P1);

    expect(first).toEqual(BYTES);
    expect(second).toEqual(BYTES);
    expect(inner.get).toHaveBeenCalledTimes(1);
  });

  /**
   * Os bytes acabaram de sair do microfone. Descartá-los e baixá-los de volta é o
   * download que se via na própria tela da pergunta, logo depois de gravar.
   */
  it('gravar aquece o cache: reproduzir logo depois não baixa nada', async () => {
    const inner = innerStore();
    const store = new CachedVoiceStore(inner, memoryCache(), 's-1');

    await store.put(P1, BYTES);
    const back = await store.get(P1);

    expect(back).toEqual(BYTES);
    expect(inner.get).not.toHaveBeenCalled();
  });

  it('regravar substitui os bytes guardados — o cache nunca serve take velha', async () => {
    const inner = innerStore();
    const store = new CachedVoiceStore(inner, memoryCache(), 's-1');
    await store.put(P1, BYTES);

    const nova = new Uint8Array([9, 9]);
    await store.put(P1, nova);

    expect(await store.get(P1)).toEqual(nova);
  });

  it('apagar a resposta apaga o cache junto: a próxima leitura volta ao armazém', async () => {
    const inner = innerStore({ [P1]: BYTES });
    const store = new CachedVoiceStore(inner, memoryCache(), 's-1');
    await store.get(P1);

    await store.delete(P1);

    await expect(store.get(P1)).rejects.toThrow();
  });

  it('duas sessões não colidem: o caminho é relativo à sessão', async () => {
    const cache = memoryCache();
    const a = new CachedVoiceStore(innerStore({ [P1]: BYTES }), cache, 's-1');
    const outros = new Uint8Array([7]);
    const b = new CachedVoiceStore(innerStore({ [P1]: outros }), cache, 's-2');

    expect(await a.get(P1)).toEqual(BYTES);
    expect(await b.get(P1)).toEqual(outros);
  });

  it('concluir a sessão devolve o espaço, sem levar as outras junto', async () => {
    const cache = memoryCache();
    const store = new CachedVoiceStore(innerStore(), cache, 's-1');
    const outra = new CachedVoiceStore(innerStore(), cache, 's-2');
    await store.put(P1, BYTES);
    await outra.put(P2, BYTES);

    await store.forget();

    expect(cache.entries.size).toBe(1);
    expect([...cache.entries.keys()][0]).toContain('s-2');
  });
});

describe('CachedVoiceStore — o cache é conveniência, nunca condição', () => {
  /** Aba anônima, cota estourada, IndexedDB bloqueado: a resposta tem de tocar. */
  const quebrado: AudioCache = {
    get: () => Promise.reject(new Error('IndexedDB indisponível')),
    put: () => Promise.reject(new Error('QuotaExceededError')),
    delete: () => Promise.reject(new Error('IndexedDB indisponível')),
    clearSession: () => Promise.reject(new Error('IndexedDB indisponível')),
  };

  it('cache que falha ao ler não impede a reprodução', async () => {
    const store = new CachedVoiceStore(innerStore({ [P1]: BYTES }), quebrado, 's-1');

    expect(await store.get(P1)).toEqual(BYTES);
  });

  it('cache que falha ao gravar não perde a resposta', async () => {
    const inner = innerStore();
    const store = new CachedVoiceStore(inner, quebrado, 's-1');

    await store.put(P1, BYTES);

    expect(inner.put).toHaveBeenCalledWith(P1, BYTES);
  });

  it('cache que falha ao apagar não impede o apagamento de verdade', async () => {
    const inner = innerStore({ [P1]: BYTES });
    const store = new CachedVoiceStore(inner, quebrado, 's-1');

    await store.delete(P1);

    expect(inner.delete).toHaveBeenCalledWith(P1);
  });

  /**
   * O armazém é a verdade e o cache não sabe o que existe no servidor — responder
   * `has` pelo cache faria uma resposta gravada noutro aparelho sumir da revisão.
   */
  it('has nunca é respondido pelo cache', async () => {
    const inner = innerStore();
    const store = new CachedVoiceStore(inner, memoryCache(), 's-1');
    await store.put(P1, BYTES);

    expect(await store.has(P1)).toBe(true);
    expect(inner.has).toHaveBeenCalledWith(P1);
  });
});
