/**
 * Armazéns de resposta de voz POR SESSÃO (§10.4: o caminho `respostas/…` é
 * relativo à sessão — o namespace por sessão é responsabilidade de quem guarda,
 * como o servidor faz em `sound-necklace/{session_id}/…`). Sem isto, um armazém
 * único por aba colapsa a mesma pergunta de sessões diferentes na MESMA gravação.
 *
 * ponytail: os bytes vivem na aba (Map em memória) até a área de recursos reais
 * da ENG-247 ligar o put/get ao tripod-api — um reload perde os bytes (os
 * caminhos em `meta.voice` persistem no estado da sessão).
 */

import { MemoryVoiceStore } from '../../adapters/voice/memory-store';

const stores = new Map<string, MemoryVoiceStore>();

export function voiceStoreFor(sessionId: string | null): MemoryVoiceStore {
  const key = sessionId ?? '__fora-de-sessao__';
  let store = stores.get(key);
  if (!store) {
    store = new MemoryVoiceStore();
    stores.set(key, store);
  }
  return store;
}
