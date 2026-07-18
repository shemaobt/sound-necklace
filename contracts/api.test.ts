import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ArtifactKindSchema,
  ArtifactResponseSchema,
  ArtifactTripleSchema,
  ArtifactUploadResponseSchema,
  AuthResponseSchema,
  AutosaveRequestSchema,
  AutosaveResponseSchema,
  CreateSessionRequestSchema,
  LockStatusSchema,
  MyProjectRolesResponseSchema,
  MyRoleResponseSchema,
  MyRolesResponseSchema,
  OpaqueArtifactSchema,
  ResourceListResponseSchema,
  ResourceSummarySchema,
  ResourceUrlResponseSchema,
  RoleSchema,
  SessionListResponseSchema,
  SessionStatePayloadSchema,
  SessionStatusSchema,
  SessionSummarySchema,
  TokenRefreshRequestSchema,
  TokenResponseSchema,
  UserLoginRequestSchema,
  UserResponseSchema,
} from './api';

const manifestId = 'fnv1a32:0f2a9c3d';

describe('auth — wire real do tripod-api (login/refresh/me/my-roles)', () => {
  const tokens = { access_token: 'jwt', refresh_token: 'r1', token_type: 'bearer' };
  const userWire = {
    id: 'u1',
    email: 'ana@shema.org',
    display_name: 'Ana',
    avatar_url: null,
    is_active: true,
    is_platform_admin: false,
    locale: 'pt-BR',
  };

  it('login é por e-mail e rejeita a forma antiga por username', () => {
    expect(
      UserLoginRequestSchema.safeParse({ email: 'ana@shema.org', password: 's3nha' }).success,
    ).toBe(true);
    expect(UserLoginRequestSchema.safeParse({ email: 'ana@shema.org' }).success).toBe(false);
    expect(UserLoginRequestSchema.safeParse({ username: 'ana', password: 's3nha' }).success).toBe(
      false,
    );
  });

  it('o par de tokens rotaciona: refresh_token é obrigatório; chave extra é recusada', () => {
    expect(TokenResponseSchema.safeParse(tokens).success).toBe(true);
    expect(
      TokenResponseSchema.safeParse({ access_token: 'jwt', token_type: 'bearer' }).success,
    ).toBe(false);
    expect(TokenResponseSchema.safeParse({ ...tokens, evil: 1 }).success).toBe(false);
  });

  it('valida o refresh e rejeita tipo errado', () => {
    expect(TokenRefreshRequestSchema.safeParse({ refresh_token: 'r' }).success).toBe(true);
    expect(TokenRefreshRequestSchema.safeParse({ refresh_token: 42 }).success).toBe(false);
  });

  it('o /me da casa não traz username nem roles; display_name é anulável mas obrigatório', () => {
    expect(UserResponseSchema.safeParse(userWire).success).toBe(true);
    expect(UserResponseSchema.safeParse({ ...userWire, display_name: null }).success).toBe(true);
    const semDisplay: Record<string, unknown> = { ...userWire };
    delete semDisplay.display_name;
    expect(UserResponseSchema.safeParse(semDisplay).success).toBe(false);
    expect(UserResponseSchema.safeParse({ ...userWire, roles: ['facilitator'] }).success).toBe(
      false,
    );
  });

  it('avatar_url e locale são opcionais no wire (default do Pydantic)', () => {
    const minimo: Record<string, unknown> = { ...userWire };
    delete minimo.avatar_url;
    delete minimo.locale;
    expect(UserResponseSchema.safeParse(minimo).success).toBe(true);
  });

  it('login devolve o envelope user + tokens', () => {
    expect(AuthResponseSchema.safeParse({ user: userWire, tokens }).success).toBe(true);
    expect(AuthResponseSchema.safeParse({ user: userWire }).success).toBe(false);
  });

  it('my-project-roles traz o dicionário projeto→papel (fonte do projectId real)', () => {
    expect(
      MyProjectRolesResponseSchema.safeParse({
        is_platform_admin: false,
        project_roles: { 'proj-1': 'manager' },
      }).success,
    ).toBe(true);
    expect(
      MyProjectRolesResponseSchema.safeParse({ is_platform_admin: true, project_roles: {} })
        .success,
    ).toBe(true);
    expect(MyProjectRolesResponseSchema.safeParse({ project_roles: {} }).success).toBe(false);
  });

  it('papéis do app vêm de my-roles; RoleSchema segue os dois papéis (§7.1/O2)', () => {
    expect(
      MyRoleResponseSchema.safeParse({ app_key: 'sound-necklace', role_key: 'facilitator' })
        .success,
    ).toBe(true);
    expect(MyRoleResponseSchema.safeParse({ role_key: 'facilitator' }).success).toBe(false);
    // o wrapper (lista de my-roles): array válido/vazio passa; topo errado e item ruim, não
    const role = { app_key: 'sound-necklace', role_key: 'facilitator' };
    expect(MyRolesResponseSchema.safeParse([role]).success).toBe(true);
    expect(MyRolesResponseSchema.safeParse([]).success).toBe(true);
    expect(MyRolesResponseSchema.safeParse({ roles: [role] }).success).toBe(false);
    expect(MyRolesResponseSchema.safeParse([{ app_key: 'sound-necklace' }]).success).toBe(false);
    expect(RoleSchema.safeParse('facilitator').success).toBe(true);
    expect(RoleSchema.safeParse('project_admin').success).toBe(true);
    expect(RoleSchema.safeParse('admin').success).toBe(false);
  });
});

describe('sessions — create/list/summary/status', () => {
  const create = {
    audio_id: 'aud_x',
    project_id: 'proj_1',
    story_name: 'O Conto',
    story_slug: 'o-conto',
    granularity_level: 'medium',
    bead_sec: 0.25,
    manifest_id: manifestId,
    pipeline_consent: true,
  };

  it('valida create com consentimento de pipeline (§12/O6)', () => {
    expect(CreateSessionRequestSchema.safeParse(create).success).toBe(true);
  });

  it.each([
    ['bead_sec não positivo', (v: Record<string, unknown>) => (v.bead_sec = 0)],
    ['manifest_id malformado', (v: Record<string, unknown>) => (v.manifest_id = 'abc')],
    ['nível inválido', (v: Record<string, unknown>) => (v.granularity_level = 'enorme')],
    ['consent ausente', (v: Record<string, unknown>) => delete v.pipeline_consent],
  ])('rejeita create: %s', (_l, mutate) => {
    const bad: Record<string, unknown> = { ...create };
    mutate(bad);
    expect(CreateSessionRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('status é o par de estados de §7.3', () => {
    expect(SessionStatusSchema.safeParse('in_progress').success).toBe(true);
    expect(SessionStatusSchema.safeParse('completed').success).toBe(true);
    expect(SessionStatusSchema.safeParse('pausada').success).toBe(false);
  });

  const summary = {
    id: 's1',
    project_id: 'proj_1',
    story_name: 'O Conto',
    story_slug: 'o-conto',
    status: 'in_progress',
    last_modified: '2026-07-10T12:00:00Z',
    progress: { current_step: 'triage' },
  };

  it('valida o resumo do dashboard e rejeita passo inválido', () => {
    expect(SessionSummarySchema.safeParse(summary).success).toBe(true);
    expect(
      SessionSummarySchema.safeParse({ ...summary, progress: { current_step: 'x' } }).success,
    ).toBe(false);
  });

  it('valida a listagem de sessões', () => {
    expect(SessionListResponseSchema.safeParse({ sessions: [summary] }).success).toBe(true);
    expect(SessionListResponseSchema.safeParse({ sessions: [{ id: 's1' }] }).success).toBe(false);
  });
});

describe('sessions — autosave (session-state opaco; schema real vem no ENG-234)', () => {
  it('valida só o envelope versionado e deixa passar o resto do estado', () => {
    const state = {
      schema_version: 1,
      mode: 'triagem',
      parts: [{ part_id: 'PT1' }],
      desconhecida: 42,
    };
    const parsed = SessionStatePayloadSchema.parse(state);
    expect(parsed).toMatchObject(state);
  });

  it('rejeita autosave sem schema_version', () => {
    expect(AutosaveRequestSchema.safeParse({ mode: 'triagem' }).success).toBe(false);
  });

  it('valida o ack do autosave', () => {
    expect(
      AutosaveResponseSchema.safeParse({ saved_at: '2026-07-10T12:00:00Z', schema_version: 1 })
        .success,
    ).toBe(true);
  });
});

describe('artifacts — payload OPACO (§10.5): nunca desserializar/reserializar', () => {
  it('OpaqueArtifactSchema devolve a string idêntica ao upload (round-trip byte-a-byte)', () => {
    const bytes = '{"manifest_id":"fnv1a32:0f2a9c3d","média":"acento cru","z":1,"a":2}\n';
    expect(OpaqueArtifactSchema.parse(bytes)).toBe(bytes);
  });

  it('o módulo api.ts NÃO contém JSON.parse/JSON.stringify (custódia opaca)', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'api.ts'), 'utf8');
    // forma de CHAMADA (com `(`): uma menção em comentário não é (de)serialização
    expect(src).not.toMatch(/JSON\.parse\(/);
    expect(src).not.toMatch(/JSON\.stringify\(/);
  });

  it('kind é o trio de artefatos', () => {
    expect(ArtifactKindSchema.safeParse('manifest').success).toBe(true);
    expect(ArtifactKindSchema.safeParse('anchoring').success).toBe(true);
    expect(ArtifactKindSchema.safeParse('report').success).toBe(true);
    expect(ArtifactKindSchema.safeParse('outro').success).toBe(false);
  });

  it('valida o trio na conclusão da sessão (§8.8)', () => {
    const triple = { manifest: '{...}', anchoring: '{...}', report: '# md' };
    expect(ArtifactTripleSchema.safeParse(triple).success).toBe(true);
    expect(ArtifactTripleSchema.safeParse({ manifest: '{...}', anchoring: '{...}' }).success).toBe(
      false,
    );
  });

  it('valida o recibo do upload multipart (POST /artifacts → 201)', () => {
    const receipt = { kind: 'manifest', size: 1234, crc32c: 'AAAAAA==', sha256: 'ab'.repeat(32) };
    expect(ArtifactResponseSchema.safeParse(receipt).success).toBe(true);
    expect(ArtifactUploadResponseSchema.safeParse([receipt]).success).toBe(true);
    expect(ArtifactUploadResponseSchema.safeParse([]).success).toBe(true);
    expect(ArtifactResponseSchema.safeParse({ ...receipt, kind: 'outro' }).success).toBe(false);
    expect(ArtifactResponseSchema.safeParse({ kind: 'manifest', size: 1 }).success).toBe(false);
    // o wrapper também recusa: topo que não é array, item malformado dentro
    expect(ArtifactUploadResponseSchema.safeParse({ receipts: [receipt] }).success).toBe(false);
    expect(ArtifactUploadResponseSchema.safeParse([{ ...receipt, size: 'x' }]).success).toBe(false);
  });
});

describe('lock — editor único (§7.3/O4)', () => {
  it('valida o status com titular e sem titular', () => {
    expect(
      LockStatusSchema.safeParse({
        held: true,
        holder: { user_id: 'u1', display_name: 'Ana' },
        expires_at: '2026-07-10T12:05:00Z',
      }).success,
    ).toBe(true);
    expect(
      LockStatusSchema.safeParse({ held: false, holder: null, expires_at: null }).success,
    ).toBe(true);
  });

  it('rejeita titular malformado', () => {
    expect(
      LockStatusSchema.safeParse({ held: true, holder: { user_id: 'u1' }, expires_at: null })
        .success,
    ).toBe(false);
  });
});

describe('resources — respostas de voz por caminho (§10.4/O5)', () => {
  it.each([
    'respostas/level1/quem.webm',
    'respostas/level2/PT1/descrever.webm',
    'respostas/level3/P12/tempo.webm',
  ])('aceita o caminho %s', (path) => {
    expect(ResourceSummarySchema.safeParse({ path, size: 9 }).success).toBe(true);
  });

  it.each([
    'respostas/level1/PT1/quem.webm',
    'respostas/level2/quem.webm',
    'respostas/level3/X1/tempo.webm',
    'respostas/level1/quem.mp3',
    'outro/level1/quem.webm',
  ])('rejeita o caminho %s', (path) => {
    expect(ResourceSummarySchema.safeParse({ path, size: 9 }).success).toBe(false);
  });

  it('valida a listagem (GET /resources) e a URL assinada (GET /resources/url)', () => {
    const item = { path: 'respostas/level1/quem.webm', size: 42 };
    expect(ResourceListResponseSchema.safeParse({ resources: [item] }).success).toBe(true);
    expect(ResourceListResponseSchema.safeParse({ resources: [] }).success).toBe(true);
    expect(ResourceListResponseSchema.safeParse({ paths: [] }).success).toBe(false);
    expect(ResourceUrlResponseSchema.safeParse({ url: 'https://x/y?sig=1' }).success).toBe(true);
    expect(ResourceUrlResponseSchema.safeParse({}).success).toBe(false);
  });
});
