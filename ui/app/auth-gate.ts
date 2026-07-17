/**
 * Modo real sem sessão viva: toda rota além do login volta ao login. O token vive
 * SÓ em memória (§12 — um reload o perde de propósito, nunca localStorage); sem
 * este gate o app seguiria usável e silenciosamente desautenticado (voz do guia
 * caindo no fallback, listagens 401). Na fixture não há gate: o fluxo de
 * teste/dev não exige login.
 */

import type { AuthUser } from '../../adapters/api';

export function shouldGateToLogin(
  mode: 'real' | 'fixture',
  routeName: string,
  user: AuthUser | null,
): boolean {
  return mode === 'real' && routeName !== 'login' && user === null;
}
