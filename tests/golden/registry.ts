/**
 * Registro de replayers do golden harness.
 *
 * Cada issue de domain/contracts REGISTRA aqui o replay dos passos que ela
 * implementa (ENG-214 grid/hash → ENG-216 cenas → ENG-219 triagem →
 * ENG-223 frases/costura → ENG-226 respostas → ENG-227/233 export real).
 * Um caso sem replayer aparece como PENDENTE (verde com aviso) até a ENG-238
 * ligar o modo estrito (zero pendências).
 *
 * Contrato: um replayer recebe os passos do caso e devolve os artefatos como
 * strings byte-exatas (mesma serialização da referência).
 */
import { buildBeads, hashPCM } from '../../domain';

import { makePcm, type PcmSpec } from './pcm';

export interface GoldenStep {
  type: string;
  [key: string]: unknown;
}

export interface GoldenCase {
  name: string;
  description: string;
  steps: GoldenStep[];
}

export type Replayer = (steps: GoldenStep[]) => Record<string, string>;

interface SegmentStep extends GoldenStep {
  beadSec: number;
  slug: string;
  audioFilename: string;
  pcm: PcmSpec;
}

interface ExportStep extends GoldenStep {
  artifacts: string[];
}

/**
 * ENG-214: replay de casos grid+manifest (passos `segment` + `export` com
 * artefato `manifesto` apenas). Espelha o passo `segment` do driver
 * (generate.mjs): duração = samples/sampleRate; serialização idêntica à
 * referência — JSON.stringify(x, null, 2) SEM newline final.
 */
const manifestReplayer: Replayer = (steps) => {
  const out: Record<string, string> = {};
  let manifest: Record<string, unknown> | null = null;
  for (const step of steps) {
    switch (step.type) {
      case 'segment': {
        const { beadSec, audioFilename, pcm } = step as SegmentStep;
        const data = makePcm(pcm.seed, pcm.samples);
        const dur = pcm.samples / pcm.sampleRate;
        const beads = buildBeads(dur, beadSec);
        const manifestId = hashPCM(
          {
            numberOfChannels: pcm.channels,
            sampleRate: pcm.sampleRate,
            getChannelData: () => data,
          },
          beadSec,
        );
        // espelho de buildManifest (referência L1316) — a ordem das chaves
        // é parte da byte-identidade
        manifest = {
          manifest_id: manifestId,
          audio_filename: audioFilename,
          bead_duration_sec: beadSec,
          total_beads: beads.length,
          beads: beads.map((b) => ({ index: b.index, startTime: b.startTime, endTime: b.endTime })),
        };
        break;
      }
      case 'export': {
        const { artifacts } = step as ExportStep;
        if (artifacts.includes('manifesto')) {
          if (!manifest) throw new Error('export antes de segment');
          out['manifesto-contas.json'] = JSON.stringify(manifest, null, 2);
        }
        if (artifacts.some((a) => a !== 'manifesto')) {
          throw new Error('manifestReplayer só produz o manifesto (ENG-214)');
        }
        break;
      }
      default:
        throw new Error(`manifestReplayer não suporta o passo ${step.type} (ENG-214)`);
    }
  }
  return out;
};

export const replayers: Record<string, Replayer> = {
  'manifest-only': manifestReplayer,
  'partial-bead': manifestReplayer,
};

/** ENG-238 liga isto: com strict=true, casos pendentes REPROVAM o harness. */
export const STRICT = false;
