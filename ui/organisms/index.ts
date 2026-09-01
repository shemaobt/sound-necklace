/**
 * ui/organisms — composições que consomem estado do domínio via props/hooks.
 * Podem importar tipos de domain/ e os barrels de atoms/molecules/tokens; nunca
 * adapters (dependency-cruiser garante). Consumidores (pages/templates) importam
 * DESTE barrel; irmãos importam-se por caminho direto.
 */
export { BlockDone, type BlockDoneProps, type ClosedBlock } from './block-done/block-done';
export {
  BREAK_AFTER_MS,
  BreakSuggestion,
  type BreakSuggestionProps,
} from './break-suggestion/break-suggestion';
export {
  NavFooterOutlet,
  NavFooterProvider,
  StationNav,
  type NavBack,
  type NavNext,
  type StationNavProps,
} from './nav-footer/nav-footer';
export { GoalReached, type GoalReachedProps } from './goal-reached/goal-reached';
export { Necklace, type NecklaceProps, type NecklaceSegment } from './necklace/necklace';
export { SIZE_EXPORT, SIZE_L, SIZE_M, SIZE_SEG, type Size } from './necklace/geometry';
export { SeamModal, type SeamCordSide, type SeamModalProps } from './seam-modal/seam-modal';
export { PreparingSession } from './preparing-session/preparing-session';
