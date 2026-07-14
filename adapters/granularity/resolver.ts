/**
 * AcoustemeGranularityResolver — a regra O8 (§6.1/§15.2), resolvida pela tripod-api
 * (PR #100 "acousteme artifact + consumption API"): cada nível (Pequena/Média/Grande)
 * resolve para um beadSec uniforme = `granularity_frames[nível] × hop_sec`. A grade do
 * tokenizador (hop de 20 ms, presets 10/25/50 frames) é fixa; áudios sem acousteme
 * (§6.1) caem nela. O resolver nunca inventa a regra — só aplica os campos do envelope.
 */

import type { AcoustemeEnvelope, GranularityLevel } from '../../contracts';
import type { GranularityResolution, GranularityResolver } from './types';

/**
 * Grade uniforme do tokenizador (tripod-api PR #100): hop de 20 ms e presets
 * 10/25/50 frames — idêntica à que o backend embute em cada envelope, aplicada aos
 * áudios sem acousteme. beadSec resultante: 0.20 / 0.50 / 1.00 s.
 */
const TOKENIZER_HOP_SEC = 0.02;
const TOKENIZER_FRAMES: Record<'small' | 'medium' | 'large', number> = {
  small: 10,
  medium: 25,
  large: 50,
};

export class AcoustemeGranularityResolver implements GranularityResolver {
  resolve(level: GranularityLevel, acousteme: AcoustemeEnvelope | null): GranularityResolution {
    if (acousteme) return { beadSec: acousteme.granularity_frames[level] * acousteme.hop_sec };
    return { beadSec: TOKENIZER_FRAMES[level] * TOKENIZER_HOP_SEC };
  }
}
