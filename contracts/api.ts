/**
 * contracts/api.ts — DTOs PROVISÓRIOS das superfícies de endpoint do tripod-api que
 * o SPA consome (auth, sessions, resources, artifacts). O bucket fica em ./bucket.
 *
 * PROVISIONAL: substituído pelos tipos gerados do OpenAPI do tripod-api quando os
 * DTOs do ENG-211 chegarem (PRD §5, code-first — os DTOs Pydantic são a fonte da
 * verdade). Até lá, estes schemas + fixtures constroem uma única superfície tipada
 * para todos os adapters-fixture. Os adapters importam SOMENTE os tipos daqui.
 *
 * §10.5 (custódia opaca): artefatos e o estado de sessão passam como bytes/objeto
 * OPACOS — este módulo NUNCA desserializa nem reserializa um artefato (sem
 * JSON.parse/JSON.stringify em lugar nenhum). Importa apenas zod (raiz) + ./bucket.
 */

import { z } from 'zod';

import { GranularityLevelSchema } from './bucket';

/** Mesmo padrão do manifest_id do domínio (FNV-1a 32 bits). */
const manifestIdSchema = z.string().regex(/^fnv1a32:[0-9a-f]{8}$/);

// ── Auth (§7.1/O1: JWT Bearer compartilhado do tripod-api; formas do OpenAPI real) ──

/** O login da casa autentica por E-MAIL (UserLoginRequest do OpenAPI). */
export const UserLoginRequestSchema = z.strictObject({
  email: z.string(),
  password: z.string(),
});
export type UserLoginRequest = z.infer<typeof UserLoginRequestSchema>;

/** Par de tokens com ROTAÇÃO: cada refresh devolve um refresh_token novo. */
export const TokenResponseSchema = z.strictObject({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const TokenRefreshRequestSchema = z.strictObject({
  refresh_token: z.string(),
});
export type TokenRefreshRequest = z.infer<typeof TokenRefreshRequestSchema>;

/** §7.1/O2: dois papéis do app; o wire (`my-roles`) traz `role_key` cru e o adapter filtra. */
export const RoleSchema = z.enum(['facilitator', 'project_admin']);
export type Role = z.infer<typeof RoleSchema>;

/**
 * O `/auth/me` da casa: usuário da PLATAFORMA — sem username e sem papéis de app.
 * `display_name` é anulável porém obrigatório; `avatar_url`/`locale` são opcionais
 * (defaults do Pydantic). O AuthUser da porta é montado disto + my-roles.
 */
export const UserResponseSchema = z.strictObject({
  id: z.string(),
  email: z.string(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable().optional(),
  is_active: z.boolean(),
  is_platform_admin: z.boolean(),
  locale: z.string().nullable().optional(),
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

/** Login devolve o envelope usuário + par de tokens (AuthResponse do OpenAPI). */
export const AuthResponseSchema = z.strictObject({
  user: UserResponseSchema,
  tokens: TokenResponseSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/** Um papel concedido ao usuário num app (`GET /auth/my-roles?app_key=`). */
export const MyRoleResponseSchema = z.strictObject({
  app_key: z.string(),
  role_key: z.string(),
});
export type MyRoleResponse = z.infer<typeof MyRoleResponseSchema>;

export const MyRolesResponseSchema = z.array(MyRoleResponseSchema);
export type MyRolesResponse = z.infer<typeof MyRolesResponseSchema>;

// ── Sessions (§7.2/§7.3) ──

/** Estados do ciclo de vida (§7.3), em ascii no fio (rótulo acentuado é display). */
export const SessionStatusSchema = z.enum(['in_progress', 'completed']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/** As seis estações do fio de contas (§8.0), como indicador de progresso glanceável. */
export const SessionStepSchema = z.enum([
  'listen',
  'cut',
  'triage',
  'phrases',
  'conversation',
  'save',
]);
export type SessionStep = z.infer<typeof SessionStepSchema>;

export const SessionProgressSchema = z.strictObject({
  current_step: SessionStepSchema,
});
export type SessionProgress = z.infer<typeof SessionProgressSchema>;

export const SessionSummarySchema = z.strictObject({
  id: z.string(),
  project_id: z.string(),
  story_name: z.string(),
  story_slug: z.string(),
  status: SessionStatusSchema,
  last_modified: z.string(),
  progress: SessionProgressSchema,
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionListResponseSchema = z.strictObject({
  sessions: z.array(SessionSummarySchema),
});
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

/**
 * Criação da sessão (§8.1): áudio do bucket + parâmetros de grade + consentimento
 * de USO no pipeline (§12/O6, o segundo momento, confirmado pela facilitadora).
 */
export const CreateSessionRequestSchema = z.strictObject({
  audio_id: z.string(),
  project_id: z.string(),
  story_name: z.string(),
  story_slug: z.string(),
  granularity_level: GranularityLevelSchema,
  bead_sec: z.number().positive(),
  manifest_id: manifestIdSchema,
  pipeline_consent: z.boolean(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

/**
 * Corpo do autosave (§7.3): o DTO completo de estado de sessão. O SCHEMA REAL é
 * do ENG-234 (contracts/session-state.ts). Aqui validamos SÓ o envelope
 * versionado e deixamos o resto do estado passar opaco (looseObject) — assim os
 * adapters compilam contra este contrato provisório sem duplicar a definição.
 */
export const SessionStatePayloadSchema = z.looseObject({
  schema_version: z.int(),
});
export type SessionStatePayload = z.infer<typeof SessionStatePayloadSchema>;

export const AutosaveRequestSchema = SessionStatePayloadSchema;
export type AutosaveRequest = z.infer<typeof AutosaveRequestSchema>;

export const AutosaveResponseSchema = z.strictObject({
  saved_at: z.string(),
  schema_version: z.int(),
});
export type AutosaveResponse = z.infer<typeof AutosaveResponseSchema>;

// ── Artifacts (§8.8/§10.5: custódia OPACA — bytes que saem do browser = bytes servidos) ──

/**
 * Payload de artefato: bytes OPACOS (§10.5). Tipado como string crua e NUNCA
 * parseado/reserializado — `parse` devolve a string idêntica ao upload. É o único
 * modo de preservar a byte-identidade com os goldens; validamos só o envelope
 * (id de sessão, filenames), nunca a forma interna do payload.
 */
export const OpaqueArtifactSchema = z.string();
export type OpaqueArtifact = z.infer<typeof OpaqueArtifactSchema>;

export const ArtifactKindSchema = z.enum(['manifest', 'anchoring', 'report']);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ArtifactTripleSchema = z.strictObject({
  manifest: OpaqueArtifactSchema,
  anchoring: OpaqueArtifactSchema,
  report: OpaqueArtifactSchema,
});
export type ArtifactTriple = z.infer<typeof ArtifactTripleSchema>;

/** Conclusão (§8.8): sobe o trio de artefatos materializado no cliente. */
export const CompleteSessionRequestSchema = z.strictObject({
  artifacts: ArtifactTripleSchema,
});
export type CompleteSessionRequest = z.infer<typeof CompleteSessionRequestSchema>;

// ── Advisory lock (§7.3/O4: editor único por sessão) ──

export const LockHolderSchema = z.strictObject({
  user_id: z.string(),
  display_name: z.string(),
});
export type LockHolder = z.infer<typeof LockHolderSchema>;

export const LockStatusSchema = z.strictObject({
  held: z.boolean(),
  holder: LockHolderSchema.nullable(),
  expires_at: z.string().nullable(),
});
export type LockStatus = z.infer<typeof LockStatusSchema>;

// ── Resources (§10.4/O5: respostas de voz WebM/Opus, uma por pergunta, por caminho) ──

/**
 * Caminho canônico de uma resposta de voz (§10.4). As três formas por nível:
 *   respostas/level1/<k>.webm
 *   respostas/level2/<part_id>/<k>.webm   (part_id = PT#)
 *   respostas/level3/<prop_id>/<k>.webm   (prop_id = P#)
 */
export const ResourcePathSchema = z
  .string()
  .regex(
    /^respostas\/(level1\/[a-z0-9_]+|level2\/PT[1-9]\d*\/[a-z0-9_]+|level3\/P[1-9]\d*\/[a-z0-9_]+)\.webm$/,
  );
export type ResourcePath = z.infer<typeof ResourcePathSchema>;

/** Referência/ack de um recurso de voz (os bytes WebM viajam opacos, fora do JSON). */
export const ResourceRefSchema = z.strictObject({
  path: ResourcePathSchema,
});
export type ResourceRef = z.infer<typeof ResourceRefSchema>;
