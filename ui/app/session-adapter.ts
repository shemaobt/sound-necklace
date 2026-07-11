/**
 * SessionStore app-global do composition root (ENG-270): UM singleton resolvido da
 * porta `sessions` do registry de adapters (fixture por default; a seleção do modo
 * real por ambiente é ENG-247). O shell o injeta na estação Export para concluir e
 * baixar os artefatos (§8.8/§10.5).
 *
 * As páginas Setup/Dashboard ainda resolvem a store pelos seus próprios `ports.ts`
 * (singletons de módulo); apontá-las para ESTE singleton é wiring de ui/pages, fora
 * do escopo aqui — segue como follow-up para o fluxo setup→export ponta a ponta
 * (ENG-247/252).
 */

import type { SessionStore } from '../../adapters/sessions';
import { buildAdapterRegistry } from './registries';

let store: SessionStore | undefined;

export function appSessionStore(): SessionStore {
  return (store ??= buildAdapterRegistry().sessions!.fixture() as SessionStore);
}
