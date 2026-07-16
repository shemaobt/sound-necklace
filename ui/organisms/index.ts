/**
 * ui/organisms — composições que consomem estado do domínio via props/hooks.
 * Podem importar tipos de domain/ e os barrels de atoms/molecules/tokens; nunca
 * adapters (dependency-cruiser garante). Consumidores (pages/templates) importam
 * DESTE barrel; irmãos importam-se por caminho direto.
 */
export {
  ConversationStage,
  type ConversationProgress,
  type ConversationStageProps,
  type RecorderState,
} from './conversation-stage/conversation-stage';
export { Necklace, type NecklaceProps, type NecklaceSegment } from './necklace/necklace';
export { SIZE_EXPORT, SIZE_L, SIZE_M, SIZE_SEG, type Size } from './necklace/geometry';
export { SeamModal, type SeamCordSide, type SeamModalProps } from './seam-modal/seam-modal';
export { StorytellerGuide, type GuideVariantProps } from './storyteller-guide';
