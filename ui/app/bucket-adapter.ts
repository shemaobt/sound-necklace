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

let cached: { userId: string; projectId: string } | null = null;

/**
 * Projeto do usuário logado (`GET /auth/my-project-roles`), cacheado POR USUÁRIO
 * pela vida da aba — logout → login com outra conta re-resolve em vez de herdar o
 * projeto anterior. Uma facilitadora de campo pertence a UM projeto; a conta de
 * dono/teste pertence a vários — nesse caso fica o primeiro projeto QUE TEM ÁUDIO
 * no bucket (sondagem única, cacheada). ponytail: seletor de projeto na UI só
 * quando o caso "vários projetos com áudio" existir de verdade.
 */
export async function resolveProjectId(): Promise<string> {
  await authReady(); // num reload, o token só existe depois da retomada assentar
  const userId = appAuth().currentUser()?.id ?? null;
  if (cached && cached.userId === userId) return cached.projectId;
  const remember = (projectId: string): string => {
    if (userId) cached = { userId, projectId };
    return projectId;
  };
  const res = await apiGet('/auth/my-project-roles');
  if (!res.ok) throw new Error(`my-project-roles → HTTP ${res.status}`);
  const parsed = MyProjectRolesResponseSchema.parse(await res.json());
  const granted = Object.keys(parsed.project_roles);
  const ids =
    granted.length === 0 && parsed.is_platform_admin ? await listAllProjectIds() : granted;
  const first = ids[0];
  if (!first) throw new Error('usuário sem projeto no tripod');

  if (ids.length > 1) {
    for (const id of ids) {
      const probe = await apiGet(`/sound-necklace/projects/${encodeURIComponent(id)}/audios`);
      if (!probe.ok) continue;
      const body = (await probe.json()) as { audios?: unknown[] };
      if ((body.audios?.length ?? 0) > 0) return remember(id);
    }
  }

  return remember(first);
}

/**
 * Se a pessoa logada pode DECIDIR a granularidade deste projeto (§8.1, ENG-352) — o
 * mesmo `my-project-roles` que resolve o projeto também diz o papel nele.
 *
 * Um platform admin passa por cima da tabela de papéis (é o que a API faz). Falha de
 * rede responde `false`: oferecer o controle a quem vai tomar 403 na confirmação é
 * pior do que mandar falar com quem administra o projeto.
 */
export async function canEditProjectGranularity(projectId: string): Promise<boolean> {
  await authReady();
  const res = await apiGet('/auth/my-project-roles');
  if (!res.ok) return false;
  const parsed = MyProjectRolesResponseSchema.parse(await res.json());
  return parsed.is_platform_admin || parsed.project_roles[projectId] === 'project_admin';
}

/**
 * Projetos da instância inteira, para quem administra a plataforma. `my-project-roles`
 * devolve `{}` para ele — a API o deixa entrar em qualquer projeto sem escrever linha
 * em `project_user_access`, então não há o que listar ali — e `GET /projects` é o
 * único endpoint que responde a pergunta nesse caso. A sondagem por áudio que vem
 * depois é a mesma da conta multi-projeto: uma requisição por projeto.
 *
 * É a única rota fora de `/auth/*` + `/sound-necklace/*` que o SPA consome, então
 * está fora do `contracts/openapi.json` e sem schema — daí a leitura defensiva. A
 * falha SOBE — inclusive uma resposta em formato inesperado: engolir a chamada
 * devolveria "usuário sem projeto no tripod" a quem tem acesso a todos eles,
 * mensagem que manda procurar o grant errado.
 */
async function listAllProjectIds(): Promise<string[]> {
  const res = await apiGet('/projects');
  if (!res.ok) throw new Error(`projects → HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error('projects → resposta inesperada');
  return body.flatMap((p: { id?: unknown }) => (typeof p?.id === 'string' ? [p.id] : []));
}

function apiGet(path: string): Promise<Response> {
  const token = appAuth().token();
  return fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
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
