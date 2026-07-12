/**
 * Resolução default das portas de entrada (§7.1/§7.2) para Login e Dashboard.
 *
 * Singletons de MÓDULO para que as duas telas coíram: a `AuthProvider` que o Login
 * usa para entrar é a MESMA que o Dashboard observa para a expiração (§7.1 — a
 * expiração volta ao login sem limpar o estado do app). Default fixture headless.
 * A SessionStore é o singleton app-global partilhado com Setup/Export (ENG-272), para
 * a sessão criada no Setup aparecer na listagem; a seleção do modo real por ambiente
 * é ENG-247.
 *
 * Nos testes as páginas recebem as portas por prop — estes defaults só valem em
 * produção, então ficam sem cobertura de teste de propósito.
 */

import type { AuthProvider } from '../../../adapters/api';
import type { SessionStore } from '../../../adapters/sessions';
import { appAuth } from '../../app/auth-adapter';
import { appSessionStore } from '../../app/session-adapter';

export function defaultAuth(): AuthProvider {
  return appAuth();
}

export function defaultSessionStore(): SessionStore {
  return appSessionStore();
}
