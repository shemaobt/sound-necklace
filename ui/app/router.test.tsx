import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { matchRoute, navigate, useRoute } from './router';

beforeEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('matchRoute', () => {
  it('mapeia as rotas de topo e extrai o id da sessão', () => {
    expect(matchRoute('/login').name).toBe('login');
    expect(matchRoute('/dashboard').name).toBe('dashboard');
    expect(matchRoute('/').name).toBe('dashboard');
    expect(matchRoute('/session/abc')).toEqual({ name: 'session', id: 'abc' });
    expect(matchRoute('/qualquer-coisa').name).toBe('unknown');
  });
});

function RouteProbe() {
  const route = useRoute();
  return (
    <span data-testid="rota">{route.name === 'session' ? `session:${route.id}` : route.name}</span>
  );
}

describe('useRoute + navigate', () => {
  it('reflete a navegação programática (pushState não dispara popstate)', () => {
    render(<RouteProbe />);
    expect(screen.getByTestId('rota').textContent).toBe('dashboard');

    act(() => navigate('/session/xyz'));
    expect(screen.getByTestId('rota').textContent).toBe('session:xyz');
  });

  it('reflete voltar/avançar via popstate', () => {
    render(<RouteProbe />);
    act(() => navigate('/login'));
    expect(screen.getByTestId('rota').textContent).toBe('login');

    act(() => {
      window.history.replaceState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByTestId('rota').textContent).toBe('dashboard');
  });
});
