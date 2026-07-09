/**
 * Superfície pública do adapter de áudio (ENG-217). O app resolve o engine
 * pela porta 'audio' do register.ts; estes exports servem a testes e à camada
 * de wiring (ui/pages, ui/templates, ui/app).
 */

export {
  AudioDecodeError,
  type AudioEngine,
  type DecodedAudio,
  type HeadListener,
  type Player,
  type PlayerState,
  type Unsubscribe,
} from './types';
export { createPlayer, edgeWindow, type PlaybackHandle, type PlaybackTransport } from './player';
export { FixtureAudioEngine, FixtureTransport, pcmSpecBytes } from './fixture';
export type { PcmSpec } from '../../tests/golden/pcm';
export { WebAudioEngine } from './web-audio';
