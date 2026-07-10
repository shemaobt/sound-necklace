/**
 * Resolução default das portas de entrada (§7.1/§7.2) para Login e Dashboard.
 *
 * Singletons de MÓDULO para que as duas telas coíram: a `AuthProvider` que o Login
 * usa para entrar é a MESMA que o Dashboard observa para a expiração (§7.1 — a
 * expiração volta ao login sem limpar o estado do app). Default fixture headless;
 * a seleção do modo real por ambiente e a store app-global partilhada com o Setup
 * são wiring do composition root (ENG-247/follow-up do shell), fora do escopo aqui.
 *
 * Nos testes as páginas recebem as portas por prop — estes defaults só valem em
 * produção, então ficam sem cobertura de teste de propósito.
 */

import { FixtureAuthProvider, type AuthProvider } from '../../../adapters/api';
import { FixtureSessionStore, type SessionStore } from '../../../adapters/sessions';

let auth: AuthProvider | undefined;
export function defaultAuth(): AuthProvider {
  return (auth ??= new FixtureAuthProvider());
}

let store: SessionStore | undefined;
export function defaultSessionStore(): SessionStore {
  return (store ??= new FixtureSessionStore());
}
