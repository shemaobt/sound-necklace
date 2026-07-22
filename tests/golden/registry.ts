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
import {
  buildBeads,
  confirmFrase,
  confirmFrasesDone,
  confirmPart,
  confirmParts,
  confirmWhole,
  createSession,
  ensureMapping,
  enterScene,
  enterSegmentacao,
  frontier,
  hashPCM,
  lockedParts,
  markNoneFit,
  moveBorder,
  reanchorFrase,
  removeFrase,
  setAnswer,
  setMode,
  tagScene,
  triagemDone,
  type AnswerSlot,
  type Confidence,
  type SceneResult,
  type SessionState,
} from '../../domain';

import {
  applyReturn,
  buildManifesto,
  buildMapReport,
  buildRetorno,
  ReturnSchema,
  serializeArtifact,
} from '../../contracts';

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
 * ENG-214/227: replay de casos grid+manifest (passos `segment` + `export` com
 * artefato `manifesto` apenas). Espelha o passo `segment` do driver
 * (generate.mjs): duração = samples/sampleRate. Desde a ENG-227 o artefato sai
 * pelo mapper+serializer REAIS de contracts/ (buildManifesto + serializeArtifact)
 * — o golden compara os bytes de produção, não um espelho local.
 */
const manifestReplayer: Replayer = (steps) => {
  const out: Record<string, string> = {};
  let state: SessionState | null = null;
  for (const step of steps) {
    switch (step.type) {
      case 'segment': {
        const { beadSec, audioFilename, slug, pcm } = step as SegmentStep;
        const data = makePcm(pcm.seed, pcm.samples);
        const dur = pcm.samples / pcm.sampleRate;
        state = createSession({
          durationSec: dur,
          beadSec,
          beads: buildBeads(dur, beadSec),
          manifestId: hashPCM(
            {
              numberOfChannels: pcm.channels,
              sampleRate: pcm.sampleRate,
              getChannelData: () => data,
            },
            beadSec,
          ),
          audioFilename,
          slug,
        });
        break;
      }
      case 'export': {
        const { artifacts } = step as ExportStep;
        if (artifacts.includes('manifesto')) {
          if (!state) throw new Error('export antes de segment');
          out['manifesto-contas.json'] = serializeArtifact(buildManifesto(state));
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

/**
 * ENG-216/219/223: replay dos passos de sessão (segment → confirmWhole →
 * cutScene → confirmParts → triage → triagemDone → enterScene → phraseSelect →
 * confirmPhrase → removePhrase → sceneDone) através dos reducers de domain/. O
 * reabrir cena/frase e o ⚑ saíram na ENG-342. Passos de issues posteriores
 * (answer, export…) param o replay e são reportados em `pendingAt` — o caso
 * minimal-flow segue PENDENTE no harness até a ENG-226 registrar as respostas
 * e a ENG-227/233 o export real.
 */
export interface SessionReplay {
  state: SessionState;
  /** primeiro passo ainda sem replayer de domínio, ou null se consumiu tudo */
  pendingAt: { index: number; type: string } | null;
}

interface CutSceneStep extends GoldenStep {
  endBead: number;
}

interface TriageStep extends GoldenStep {
  partIndex: number;
  kind?: string;
  confidence?: Confidence;
  none_fit?: boolean;
}

interface EnterSceneStep extends GoldenStep {
  partId: string;
}

interface PhraseSelectStep extends GoldenStep {
  s: number;
  e: number;
}

interface ConfirmPhraseStep extends GoldenStep {
  borderDecision?: 'move' | 'reanchor' | 'triagem';
}

interface PhraseIndexStep extends GoldenStep {
  index: number;
}

interface SceneDoneStep extends GoldenStep {
  forceEmpty?: boolean;
}

interface AnswerStep extends GoldenStep {
  level: 1 | 2 | 3;
  key: string;
  text: string;
  partId?: string;
  propId?: string;
}

interface ImportReturnStep extends GoldenStep {
  /** um retorno-ancoragem.json cru (validado por ReturnSchema no replay) */
  dto: unknown;
}

function unwrap(r: SceneResult): SessionState {
  if (!r.ok) throw new Error(`replay recusado pelo domínio — ${r.error.code}: ${r.error.message}`);
  return r.state;
}

export function replaySessionSteps(steps: GoldenStep[]): SessionReplay {
  let state: SessionState | null = null;
  // espelho da variável de módulo warnedEmptyScene da referência (L916)
  let warned: string | null = null;
  const must = (): SessionState => {
    if (!state) throw new Error('passo de sessão antes do segment');
    return state;
  };
  // confirmFrasesDone da referência: aplica o resultado e guarda o marcador
  const sceneDone = (st: SessionState): SessionState => {
    const r = confirmFrasesDone(st, warned);
    warned = r.warnedEmptyScene;
    return r.kind === 'warn-empty' || r.kind === 'noop' ? st : r.state;
  };
  for (const [i, step] of steps.entries()) {
    switch (step.type) {
      case 'segment': {
        const { beadSec, audioFilename, slug, pcm } = step as SegmentStep;
        const data = makePcm(pcm.seed, pcm.samples);
        const dur = pcm.samples / pcm.sampleRate;
        state = createSession({
          durationSec: dur,
          beadSec,
          beads: buildBeads(dur, beadSec),
          manifestId: hashPCM(
            {
              numberOfChannels: pcm.channels,
              sampleRate: pcm.sampleRate,
              getChannelData: () => data,
            },
            beadSec,
          ),
          audioFilename,
          slug,
        });
        break;
      }
      case 'confirmWhole':
        state = unwrap(confirmWhole(must()));
        break;
      case 'cutScene': {
        // driver da referência (generate.mjs L103–109): simula o 2º clique
        // (seleção {fronteira, endBead}) e confirma a cena corrente
        const st = must();
        const sel = {
          ...st,
          selection: { s: frontier(st, 'parts'), e: (step as CutSceneStep).endBead },
          pendingStart: null,
        };
        state = unwrap(confirmPart(sel, sel.current.index));
        break;
      }
      case 'confirmParts':
        state = unwrap(confirmParts(must()));
        break;
      case 'triage': {
        // o picker (referência L1258–1266) opera sobre lockedParts; o passo
        // indexa essa vista e classifica a cena alvo por part_id
        const st = must();
        const ts = step as TriageStep;
        const target = lockedParts(st)[ts.partIndex];
        if (!target) throw new Error(`triage: partIndex ${ts.partIndex} fora de lockedParts`);
        state = ts.none_fit
          ? markNoneFit(st, target.part_id)
          : tagScene(st, target.part_id, ts.kind as string, ts.confidence as Confidence);
        break;
      }
      case 'triagemDone': {
        // botão "Já classifiquei todas as cenas →" (L1185): só segue com o gate
        // habilitado; a referência então setMode("segmentacao"), cujo bloco de
        // entrada (L1003–1008) posiciona a cena ativa e o slot corrente
        const st = must();
        if (!triagemDone(st).enabled) throw new Error('triagemDone: gate desabilitado');
        state = enterSegmentacao(setMode(st, 'segmentacao'));
        break;
      }
      case 'enterScene':
        state = enterScene(must(), (step as EnterSceneStep).partId);
        break;
      case 'phraseSelect': {
        // driver (generate.mjs L138–140): escreve a seleção direto no estado
        const { s, e } = step as PhraseSelectStep;
        state = { ...must(), selection: { s, e }, pendingStart: null };
        break;
      }
      case 'confirmPhrase': {
        // driver (generate.mjs L142–160): confirma a frase corrente; se cruzou
        // a borda, o passo decide como o usuário decidiria (doMove/reanchor/
        // triagem) — sem decisão, a referência só renderiza a oferta e retorna
        const st = must();
        const r = confirmFrase(st, st.current.index);
        if (r.kind === 'error') {
          throw new Error(`replay recusado pelo domínio — ${r.error.code}: ${r.error.message}`);
        }
        if (r.kind === 'border') {
          const decision = (step as ConfirmPhraseStep).borderDecision;
          if (decision === 'move') state = moveBorder(st, r.offer);
          else if (decision === 'reanchor') state = reanchorFrase(st);
          else if (decision === 'triagem') state = setMode(st, 'triagem');
          // sem decisão: estado intacto
        } else {
          state = r.state;
        }
        break;
      }
      case 'removePhrase':
        state = removeFrase(must(), (step as PhraseIndexStep).index);
        break;
      case 'sceneDone': {
        // botão "Pronto com esta cena →" (L917–929); forceEmpty = 2º clique
        // que atravessa o aviso de cena vazia (generate.mjs L172–175)
        state = sceneDone(must());
        if ((step as SceneDoneStep).forceEmpty) state = sceneDone(must());
        break;
      }
      case 'answer': {
        // driver (generate.mjs L179–186): ensureMapping + atribuição direta
        const a = step as AnswerStep;
        const slot: AnswerSlot =
          a.level === 1
            ? { level: 1, k: a.key }
            : a.level === 2
              ? { level: 2, partId: a.partId as string, k: a.key }
              : { level: 3, propId: a.propId as string, k: a.key };
        state = setAnswer(ensureMapping(must()), slot, a.text);
        break;
      }
      case 'importReturn': {
        // ENG-234: semeia o estado pela via de retorno (spans travados, flags
        // reaplicadas) — habilita o caso import-return-roundtrip da ENG-238
        const st = must();
        const r = applyReturn(st, ReturnSchema.parse((step as ImportReturnStep).dto));
        if (!r.ok) throw new Error(`importReturn recusado pelo domínio — ${r.reason}`);
        state = r.state;
        break;
      }
      default:
        return { state: must(), pendingAt: { index: i, type: step.type } };
    }
  }
  return { state: must(), pendingAt: null };
}

/**
 * ENG-233: replay de sessão completo → export dos TRÊS artefatos pelos mappers
 * reais de contracts/ (buildManifesto + buildRetorno + buildMapReport). Reusa
 * replaySessionSteps, que consome tudo e para no passo `export` (o último);
 * daí este replayer serializa os artefatos que o passo pedir. É o que tira o
 * caso minimal-flow de PENDENTE no golden.test (o relatório .md fecha o trio).
 */
const sessionExportReplayer: Replayer = (steps) => {
  const { state, pendingAt } = replaySessionSteps(steps);
  if (!pendingAt) throw new Error('sessionExportReplayer: nenhum passo export ao fim do caso');
  const step = steps[pendingAt.index] as ExportStep;
  if (step.type !== 'export') {
    throw new Error(`sessionExportReplayer: passo não suportado ${step.type}`);
  }
  const out: Record<string, string> = {};
  if (step.artifacts.includes('manifesto')) {
    out['manifesto-contas.json'] = serializeArtifact(buildManifesto(state));
  }
  if (step.artifacts.includes('retorno')) {
    out['retorno-ancoragem.json'] = serializeArtifact(buildRetorno(state));
  }
  if (step.artifacts.includes('relatorio')) {
    out['relatorio-mapeamento.md'] = buildMapReport(state);
  }
  return out;
};

export const replayers: Record<string, Replayer> = {
  // grid + manifest apenas
  'manifest-only': manifestReplayer,
  'partial-bead': manifestReplayer,
  'hash-variants': manifestReplayer,
  'exact-multiple': manifestReplayer,
  // sessão completa → export real (manifesto/retorno/relatório)
  'minimal-flow': sessionExportReplayer,
  'reopen-cascade': sessionExportReplayer,
  'pid-reuse': sessionExportReplayer,
  'back-reach': sessionExportReplayer,
  'seam-small-move': sessionExportReplayer,
  'seam-large-move': sessionExportReplayer,
  'seam-escalation': sessionExportReplayer,
  'seam-consumed': sessionExportReplayer,
  'all-none-fit': sessionExportReplayer,
  'empty-scene-report': sessionExportReplayer,
  'flag-no-proposition': sessionExportReplayer,
  'mapping-lazy': sessionExportReplayer,
  'import-return-roundtrip': sessionExportReplayer,
};

/** ENG-238 ligou isto: com strict=true, casos pendentes REPROVAM o harness. */
export const STRICT = true;
