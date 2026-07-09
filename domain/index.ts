/**
 * domain/ — núcleo puro, congelado (CLAUDE.md).
 * Módulos chegam pelas issues E1 (ENG-214 grid/hash/ids → ENG-216
 * estado/seleção/cenas → ENG-219 triagem/gates → ENG-223 frases/costura
 * → ENG-226 roteiros/answer store).
 * Zero imports de framework/IO — enforcement em .dependency-cruiser.cjs.
 */
export const DOMAIN_LAYER = 'domain' as const;

export { buildBeads, beadAtTime, spanDur, type Bead } from './grid';
export { hashPCM, type PcmLike } from './hash';
export { nextPartId, nextPid } from './ids';
export {
  createSession,
  type Confidence,
  type Current,
  type Frase,
  type Layer,
  type Mapping,
  type Mode,
  type ScenePart,
  type SessionInit,
  type SessionState,
  type Span,
  type TagState,
  type Whole,
} from './state';
export { activeAnchor, frontier, type ActiveAnchor } from './frontier';
export { clickBead, type ClickResult, type PlayAction } from './selection';
export {
  addPart,
  confirmPart,
  confirmParts,
  confirmWhole,
  primePart,
  reopenPart,
  reopenWhole,
  SCENE_ERROR_COPY,
  type SceneError,
  type SceneErrorCode,
  type SceneResult,
} from './scenes';
