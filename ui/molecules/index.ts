/**
 * ui/molecules — composições reutilizáveis dos átomos Shemá.
 * Ainda puramente apresentacionais: props in, events out; sem domain/adapters
 * (dependency-cruiser garante). Consumidores (organismos) importam DESTE barrel;
 * irmãos importam-se por caminho direto.
 */
export { BeadRow, type BeadCell } from './bead-row/bead-row';
export { ConfidenceTrio, type ConfidenceChoice } from './confidence-trio/confidence-trio';
export {
  ConversationProgressBar,
  type ConversationTrecho,
} from './conversation-progress-bar/conversation-progress-bar';
export { DocumentCard } from './document-card/document-card';
export { KindCard } from './kind-card/kind-card';
export { ProgressDots } from './progress-dots/progress-dots';
export { QuestionCard } from './question-card/question-card';
export { SaveChip, type SaveStatus } from './save-chip/save-chip';
export { ScenePhraseChip } from './scene-phrase-chip/scene-phrase-chip';
export { SelectionBand, type SelectionBandRow } from './selection-band/selection-band';
export { StepperStation, type StationState } from './stepper-station/stepper-station';
export { TrechoIndicator } from './trecho-indicator/trecho-indicator';
export { TrustChip } from './trust-chip/trust-chip';
