/**
 * bead-manifest.json — schema (PRD v2 §10.1) + mapper, port 1:1 de
 * buildManifest() da referência (docs/reference/index.html L1316–1317).
 * A ordem das chaves do literal é parte da byte-identidade: manifest_id,
 * audio_filename, bead_duration_sec, total_beads, beads[{index, startTime,
 * endTime}] — cada bead re-projetada para um objeto NOVO nessa ordem.
 */

import { z } from 'zod';

import type { SessionState } from '../domain';

export const ManifestoSchema = z.strictObject({
  manifest_id: z.string().regex(/^fnv1a32:[0-9a-f]{8}$/),
  audio_filename: z.string(),
  bead_duration_sec: z.number().positive(),
  total_beads: z.int().nonnegative(),
  beads: z.array(
    z.strictObject({
      index: z.int().nonnegative(),
      startTime: z.number().nonnegative(),
      endTime: z.number().nonnegative(),
    }),
  ),
});

export type Manifesto = z.infer<typeof ManifestoSchema>;

export function buildManifesto(state: SessionState): Manifesto {
  return {
    manifest_id: state.manifestId,
    audio_filename: state.audioFilename,
    bead_duration_sec: state.beadSec,
    total_beads: state.totalBeads,
    beads: state.beads.map((b) => ({
      index: b.index,
      startTime: b.startTime,
      endTime: b.endTime,
    })),
  };
}

/** Gate do dlManifest (referência L1331): sem grade (`!state.totalBeads`) o
 *  export é um no-op SILENCIOSO — exposto como predicado para o chamador. */
export function canExportManifesto(state: SessionState): boolean {
  return state.totalBeads > 0;
}
