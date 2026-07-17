/**
 * contracts/ — DTOs validados por schema + mappers (camada CONGELADA, CLAUDE.md).
 * Módulos chegam pelas issues E1: ENG-227 (manifesto/retorno/serializer),
 * ENG-233 (relatório .md), ENG-234 (session-state + imports), ENG-235 (API/bucket).
 * Importa apenas domain/ (+ zod, raiz "zod" somente).
 */
export const CONTRACTS_LAYER = 'contracts' as const;

export { manifestoFilename, retornoFilename, serializeArtifact } from './serialize';
export { buildManifesto, canExportManifesto, ManifestoSchema, type Manifesto } from './manifesto';
export {
  buildRetorno,
  retornoExportStatus,
  RetornoSchema,
  type Retorno,
  type RetornoExportStatus,
} from './retorno';
export { buildMapReport, relatorioFilename } from './relatorio';
export {
  fromSessionDto,
  SessionStateDtoSchema,
  toSessionDto,
  type SessionMeta,
  type SessionStateDto,
} from './session-state';
export {
  applyDelivery,
  applyReturn,
  DeliverySchema,
  DELIVERY_NO_GRID_MSG,
  MANIFEST_MISMATCH_MSG,
  ReturnSchema,
  RETURN_NO_GRID_MSG,
  type Delivery,
  type ImportOutcome,
  type ReturnImport,
} from './imports';

// DTOs PROVISÓRIOS do bucket + endpoints (ENG-235) — trocados pelos tipos gerados
// do OpenAPI do tripod-api (ENG-211). Adapters importam SOMENTE os tipos daqui.
export {
  AcoustemeEnvelopeSchema,
  AcoustemeGranularityFramesSchema,
  AudioUrlResponseSchema,
  BucketAudioSchema,
  BucketListResponseSchema,
  GranularityLevelSchema,
  type AcoustemeEnvelope,
  type AcoustemeGranularityFrames,
  type AudioUrlResponse,
  type BucketAudio,
  type BucketAudioBytes,
  type BucketListResponse,
  type GranularityLevel,
} from './bucket';
export {
  ArtifactKindSchema,
  ArtifactTripleSchema,
  AuthResponseSchema,
  AutosaveRequestSchema,
  AutosaveResponseSchema,
  CompleteSessionRequestSchema,
  CreateSessionRequestSchema,
  LockHolderSchema,
  LockStatusSchema,
  MyProjectRolesResponseSchema,
  MyRoleResponseSchema,
  MyRolesResponseSchema,
  OpaqueArtifactSchema,
  ResourcePathSchema,
  ResourceRefSchema,
  RoleSchema,
  SessionListResponseSchema,
  SessionProgressSchema,
  SessionStatePayloadSchema,
  SessionStatusSchema,
  SessionStepSchema,
  SessionSummarySchema,
  TokenRefreshRequestSchema,
  TokenResponseSchema,
  UserLoginRequestSchema,
  UserResponseSchema,
  type ArtifactKind,
  type ArtifactTriple,
  type AuthResponse,
  type AutosaveRequest,
  type AutosaveResponse,
  type CompleteSessionRequest,
  type CreateSessionRequest,
  type LockHolder,
  type LockStatus,
  type MyProjectRolesResponse,
  type MyRoleResponse,
  type MyRolesResponse,
  type OpaqueArtifact,
  type ResourcePath,
  type ResourceRef,
  type Role,
  type SessionListResponse,
  type SessionProgress,
  type SessionStatePayload,
  type SessionStatus,
  type SessionStep,
  type SessionSummary,
  type TokenRefreshRequest,
  type TokenResponse,
  type UserLoginRequest,
  type UserResponse,
} from './api';
