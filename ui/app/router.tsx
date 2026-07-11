import { useSyncExternalStore } from 'react';

/**
 * Roteador mínimo sobre a History API — sem react-router (a dependência está fora
 * do escopo desta issue). Rotas: /login, /dashboard, /setup, /session/:id (PRD §7.3).
 *
 * `pushState`/`replaceState` NÃO disparam `popstate` (spec/navegadores/jsdom), então
 * `navigate` notifica os inscritos à mão; `subscribe` também ouve `popstate` para o
 * voltar/avançar do navegador. `useSyncExternalStore` é o primitivo do React 19
 * para fontes externas — o snapshot é o `pathname` (primitivo, comparável por Object.is).
 */

export type Route =
  | { name: 'login' }
  | { name: 'dashboard' }
  | { name: 'setup' }
  | { name: 'session'; id: string }
  | { name: 'unknown'; path: string };

export function matchRoute(path: string): Route {
  if (path === '/login') return { name: 'login' };
  if (path === '/' || path === '/dashboard') return { name: 'dashboard' };
  if (path === '/setup') return { name: 'setup' };
  const session = /^\/session\/([^/]+)\/?$/.exec(path);
  if (session) return { name: 'session', id: decodeURIComponent(session[1]!) };
  return { name: 'unknown', path };
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);
  notify();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener('popstate', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('popstate', cb);
  };
}

function getPathname(): string {
  return window.location.pathname;
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getPathname, () => '/');
}

export function useRoute(): Route {
  return matchRoute(usePathname());
}
