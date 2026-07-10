import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ArtifactKindSchema,
  ArtifactTripleSchema,
  AutosaveRequestSchema,
  AutosaveResponseSchema,
  CompleteSessionRequestSchema,
  CreateSessionRequestSchema,
  LockStatusSchema,
  LoginRequestSchema,
  MeResponseSchema,
  OpaqueArtifactSchema,
  RefreshRequestSchema,
  ResourceRefSchema,
  RoleSchema,
  SessionListResponseSchema,
  SessionStatePayloadSchema,
  SessionStatusSchema,
  SessionSummarySchema,
  TokenResponseSchema,
} from './api';

const manifestId = 'fnv1a32:0f2a9c3d';

describe('auth — login/refresh/token/me', () => {
  it('valida login e rejeita chave faltando', () => {
    expect(LoginRequestSchema.safeParse({ username: 'ana', password: 's3nha' }).success).toBe(true);
    expect(LoginRequestSchema.safeParse({ username: 'ana' }).success).toBe(false);
  });

  it('valida o token Bearer e rejeita chave extra', () => {
    expect(
      TokenResponseSchema.safeParse({ access_token: 'jwt', token_type: 'bearer' }).success,
    ).toBe(true);
    expect(
      TokenResponseSchema.safeParse({ access_token: 'jwt', token_type: 'bearer', evil: 1 }).success,
    ).toBe(false);
  });

  it('valida o refresh e rejeita tipo errado', () => {
    expect(RefreshRequestSchema.safeParse({ refresh_token: 'r' }).success).toBe(true);
    expect(RefreshRequestSchema.safeParse({ refresh_token: 42 }).success).toBe(false);
  });

  it('me traz os dois papéis do app (§7.1/O2) e rejeita papel desconhecido', () => {
    expect(RoleSchema.safeParse('facilitator').success).toBe(true);
    expect(RoleSchema.safeParse('project_admin').success).toBe(true);
    expect(RoleSchema.safeParse('admin').success).toBe(false);
    expect(
      MeResponseSchema.safeParse({ id: 'u1', username: 'ana', roles: ['facilitator'] }).success,
    ).toBe(true);
    expect(MeResponseSchema.safeParse({ id: 'u1', username: 'ana', roles: ['root'] }).success).toBe(
      false,
    );
  });
});

describe('sessions — create/list/summary/status', () => {
  const create = {
    audio_id: 'aud_x',
    project_id: 'proj_1',
    story_name: 'O Conto',
    story_slug: 'o-conto',
    granularity_level: 'media',
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
    expect(SessionStatusSchema.safeParse('em_progresso').success).toBe(true);
    expect(SessionStatusSchema.safeParse('concluida').success).toBe(true);
    expect(SessionStatusSchema.safeParse('pausada').success).toBe(false);
  });

  const summary = {
    id: 's1',
    project_id: 'proj_1',
    story_name: 'O Conto',
    story_slug: 'o-conto',
    status: 'em_progresso',
    last_modified: '2026-07-10T12:00:00Z',
    progress: { current_step: 'triagem' },
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
    expect(ArtifactKindSchema.safeParse('manifesto').success).toBe(true);
    expect(ArtifactKindSchema.safeParse('retorno').success).toBe(true);
    expect(ArtifactKindSchema.safeParse('relatorio').success).toBe(true);
    expect(ArtifactKindSchema.safeParse('outro').success).toBe(false);
  });

  it('valida o trio na conclusão da sessão (§8.8)', () => {
    const triple = { manifesto: '{...}', retorno: '{...}', relatorio: '# md' };
    expect(ArtifactTripleSchema.safeParse(triple).success).toBe(true);
    expect(CompleteSessionRequestSchema.safeParse({ artifacts: triple }).success).toBe(true);
    expect(ArtifactTripleSchema.safeParse({ manifesto: '{...}', retorno: '{...}' }).success).toBe(
      false,
    );
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
    expect(ResourceRefSchema.safeParse({ path }).success).toBe(true);
  });

  it.each([
    'respostas/level1/PT1/quem.webm',
    'respostas/level2/quem.webm',
    'respostas/level3/X1/tempo.webm',
    'respostas/level1/quem.mp3',
    'outro/level1/quem.webm',
  ])('rejeita o caminho %s', (path) => {
    expect(ResourceRefSchema.safeParse({ path }).success).toBe(false);
  });
});
