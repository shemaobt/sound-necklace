/**
 * `AudioCache` sobre IndexedDB — a camada que faz o áudio sobreviver ao reload.
 *
 * Escrito à mão, sem wrapper: são quatro operações num único object store com chave
 * de string, e a API crua cabe em menos linhas do que a dependência custaria.
 *
 * Nada aqui promete durar. Uma sessão de 41 respostas gira em torno de 10–20 MB, e o
 * navegador pode despejar tudo sob pressão de armazenamento sem avisar; o
 * `CachedVoiceStore` já trata cada falha como "não estava em cache", que é a leitura
 * correta em todos os casos. `clearSession` é a devolução deliberada do espaço, quando
 * a sessão é concluída e o áudio não vai mais ser reproduzido.
 */

import type { AudioCache } from './cached-store';

const DB_NAME = 'cds-audio';
const DB_VERSION = 1;
const STORE = 'answers';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponível'));
    // outra aba segura uma versão antiga: falha em vez de esperar para sempre
    req.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba'));
  });
}

function run<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = body(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('falha no IndexedDB'));
        tx.oncomplete = () => db.close();
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error('transação abortada'));
        };
      }),
  );
}

export function idbAudioCache(): AudioCache {
  return {
    async get(key) {
      const hit = await run<ArrayBuffer | undefined>('readonly', (s) => s.get(key));
      return hit ? new Uint8Array(hit) : null;
    },

    async put(key, bytes) {
      // o ArrayBuffer é o que o IndexedDB guarda sem cópia estrutural cara; `slice`
      // desprende a view do buffer da gravação, que pode ser maior que os bytes
      const buf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      await run('readwrite', (s) => s.put(buf, key));
    },

    async delete(key) {
      await run('readwrite', (s) => s.delete(key));
    },

    async clearSession(sessionId) {
      // as chaves são `${sessionId}/${path}`, então o intervalo pega a sessão inteira
      // sem varrer o resto — e sem levar as outras sessões junto
      const range = IDBKeyRange.bound(`${sessionId}/`, `${sessionId}/￿`);
      await run('readwrite', (s) => s.delete(range));
    },
  };
}
