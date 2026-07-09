/**
 * ui/atoms — blocos puramente apresentacionais do sistema Shemá.
 * Props in, events out: nada de domain/adapters (dependency-cruiser garante).
 * Consumidores importam DESTE barrel; irmãos importam-se por caminho direto.
 */
export { Button } from './button/button';
export { Chip } from './chip/chip';
export { ConfidenceDisc } from './confidence-disc/confidence-disc';
export { CordLine } from './cord/cord';
export { Pearl, type PearlState } from './pearl/pearl';
export { PlayGlyph } from './play-glyph/play-glyph';
export { WaveformBar } from './waveform-bar/waveform-bar';
