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
  absorbNextScene,
  addPart,
  confirmPart,
  confirmParts,
  confirmWhole,
  primePart,
  removePart,
  SCENE_ERROR_COPY,
  type SceneError,
  type SceneErrorCode,
  type SceneResult,
} from './scenes';
export {
  SCENE_KINDS,
  SK_PT,
  skEnShort,
  skShort,
  T_TARGET,
  type SceneKind,
  type Tier,
} from './scene-kinds';
export { lockedParts, markNoneFit, productiveScenes, tagScene } from './triagem';
export { computeCoverage, type Coverage, type CoverageStatus, type KindCoverage } from './coverage';
export {
  modeLocks,
  resolveMode,
  setMode,
  triagemDone,
  type ModeLocks,
  type TriagemDone,
} from './gates';
export {
  BORDER_COPY,
  classifyBorderMove,
  dragSceneBoundary,
  nextNeighbor,
  prevNeighbor,
  sceneHasFrases,
  sceneWindow,
  slideSeam,
  windowMargin,
  type AnchoredPart,
  type BorderOffer,
  type BorderOfferKind,
} from './seam';
export {
  absorbNextFrase,
  activeScene,
  addFrase,
  confirmFrase,
  confirmFrasesDone,
  dragPhraseBoundary,
  enterFrasesLayer,
  enterScene,
  enterSegmentacao,
  FRASE_ERROR_COPY,
  FRASES_EMPTY_WARNING,
  moveBorder,
  phraseFrontier,
  primeFrase,
  reanchorFrase,
  removeFrase,
  sceneIndexOf,
  type ConfirmFraseResult,
  type FraseError,
  type FraseErrorCode,
  type FrasesDoneResult,
} from './phrases';
export { L1_Q, L2_Q, L3_Q, type MapQuestion } from './mapeamento-scripts';
export {
  ensureMapping,
  productiveFrases,
  questionSequence,
  setAnswer,
  voiceAnswerPath,
  type AnswerSlot,
  type ProductiveFrase,
  type QuestionSlot,
} from './mapping';
