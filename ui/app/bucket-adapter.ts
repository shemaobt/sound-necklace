/**
 * Bucket app-global (ENG-247): UM singleton mode-aware partilhado pela Setup e
 * pelo player de sessão. No modo real, o projeto vem de `my-project-roles` e o
 * Bearer do AuthProvider; na fixture, o bucket sintético de sempre — teste/CI
 * seguem sem rede.
 */

import { FixtureBucketSource, HttpBucketSource, type BucketSource } from '../../adapters/bucket';
import { MyProjectRolesResponseSchema } from '../../contracts';
import { API_BASE_URL, API_MODE } from './api-config';
import { appAuth, authReady } from './auth-adapter';

let projectId: string | null = null;

/**
 * Projeto do usuário logado (`GET /auth/my-project-roles`), cacheado pela vida da
 * aba. ponytail: facilitadora em vários projetos pega o PRIMEIRO — um seletor de
 * projeto entra quando o caso existir de verdade.
 */
export async function resolveProjectId(): Promise<string> {
  if (projectId) return projectId;
  await authReady(); // num reload, o token só existe depois da retomada assentar
  const token = appAuth().token();
  const res = await fetch(`${API_BASE_URL}/auth/my-project-roles`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`my-project-roles → HTTP ${res.status}`);
  const parsed = MyProjectRolesResponseSchema.parse(await res.json());
  const first = Object.keys(parsed.project_roles)[0];
  if (!first) throw new Error('usuário sem projeto no tripod');
  projectId = first;
  return first;
}

let bucket: BucketSource | undefined;

export function appBucket(): BucketSource {
  return (bucket ??=
    API_MODE === 'real'
      ? new HttpBucketSource({
          baseUrl: API_BASE_URL,
          fetch: globalThis.fetch.bind(globalThis),
          projectId: resolveProjectId,
          token: () => appAuth().token(),
        })
      : new FixtureBucketSource());
}
