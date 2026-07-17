import { describe, expect, it } from 'vitest';

import { shouldGateToLogin } from './auth-gate';

const USER = { id: 'u1', username: 'Ana', roles: ['facilitator' as const] };

describe('shouldGateToLogin — modo real sem sessão volta ao login (§12)', () => {
  it('real + sem usuário + fora do login → gate', () => {
    expect(shouldGateToLogin('real', 'dashboard', null)).toBe(true);
    expect(shouldGateToLogin('real', 'session', null)).toBe(true);
  });

  it('a própria tela de login nunca é gateada (senão vira loop)', () => {
    expect(shouldGateToLogin('real', 'login', null)).toBe(false);
  });

  it('com sessão viva não há gate', () => {
    expect(shouldGateToLogin('real', 'dashboard', USER)).toBe(false);
  });

  it('fixture segue livre (o fluxo de teste/dev não exige login)', () => {
    expect(shouldGateToLogin('fixture', 'dashboard', null)).toBe(false);
  });
});
