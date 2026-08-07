/**
 * Armazém de respostas de voz POR SESSÃO (§10.4: o caminho `respostas/…` é relativo
 * à sessão — o namespace por sessão é responsabilidade de quem guarda, como o
 * servidor faz em `sound-necklace/{session_id}/…`). Sem isto, um armazém único por
 * aba colapsa a mesma pergunta de sessões diferentes na MESMA gravação.
 *
 * Modo real (ENG-247): os bytes vivem nos recursos da sessão no tripod-api
 * (`SessionVoiceStore` sobre o SessionStore app-global) — um reload reencontra as
 * gravações. Fixture (e fora de sessão): Map em memória por sessão, na aba.
 */

import { CachedVoiceStore } from '../../adapters/voice/cached-store';
import { idbAudioCache } from '../../adapters/voice/idb-cache';
import { MemoryVoiceStore } from '../../adapters/voice/memory-store';
import { SessionVoiceStore } from '../../adapters/voice/session-store';
import type { VoiceResourceStore } from '../../adapters/voice/types';
import { API_MODE } from './api-config';
import { appSessionStore } from './session-adapter';

const stores = new Map<string, MemoryVoiceStore>();

function memoryStoreFor(key: string): MemoryVoiceStore {
  let store = stores.get(key);
  if (!store) {
    store = new MemoryVoiceStore();
    stores.set(key, store);
  }
  return store;
}

/**
 * Só o armazém REAL ganha cache: o de memória já É o cache, e envolvê-lo em IndexedDB
 * guardaria em disco o que a fixture inventou.
 */
export function voiceStoreFor(sessionId: string | null): VoiceResourceStore {
  if (API_MODE === 'real' && sessionId !== null)
    return new CachedVoiceStore(
      new SessionVoiceStore(appSessionStore(), sessionId),
      idbAudioCache(),
      sessionId,
    );
  return memoryStoreFor(sessionId ?? '__fora-de-sessao__');
}
