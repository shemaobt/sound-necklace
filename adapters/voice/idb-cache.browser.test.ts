/**
 * Contra o IndexedDB DE VERDADE, no Chromium — é a única forma de provar o que este
 * módulo existe para fazer, que é sobreviver quando a página não sobrevive. Um dublê
 * de IndexedDB só provaria que o dublê funciona.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { idbAudioCache } from './idb-cache';

const BYTES = new Uint8Array([1, 2, 3, 250]);

beforeEach(async () => {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('cds-audio');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

describe('idbAudioCache — o áudio atravessa o reload', () => {
  it('o que foi guardado é lido de volta, byte a byte', async () => {
    await idbAudioCache().put('s-1/respostas/level1/recontar.webm', BYTES);

    // instância NOVA: é o que uma aba recarregada tem em mãos
    const depois = await idbAudioCache().get('s-1/respostas/level1/recontar.webm');

    expect(depois).toEqual(BYTES);
  });

  it('o que nunca foi guardado responde vazio, não erro', async () => {
    expect(await idbAudioCache().get('s-1/nunca-gravado.webm')).toBeNull();
  });

  it('apagar tira do disco', async () => {
    const cache = idbAudioCache();
    await cache.put('s-1/a.webm', BYTES);

    await cache.delete('s-1/a.webm');

    expect(await cache.get('s-1/a.webm')).toBeNull();
  });

  it('concluir uma sessão devolve o espaço dela, e só dela', async () => {
    const cache = idbAudioCache();
    await cache.put('s-1/a.webm', BYTES);
    await cache.put('s-1/b.webm', BYTES);
    await cache.put('s-2/a.webm', BYTES);

    await cache.clearSession('s-1');

    expect(await cache.get('s-1/a.webm')).toBeNull();
    expect(await cache.get('s-1/b.webm')).toBeNull();
    expect(await cache.get('s-2/a.webm')).toEqual(BYTES);
  });

  /** Um id que é prefixo de outro não pode levar o vizinho junto. */
  it('apagar a sessão "s-1" não toca na "s-10"', async () => {
    const cache = idbAudioCache();
    await cache.put('s-1/a.webm', BYTES);
    await cache.put('s-10/a.webm', BYTES);

    await cache.clearSession('s-1');

    expect(await cache.get('s-10/a.webm')).toEqual(BYTES);
  });
});
