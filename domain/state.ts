/**
 * Estado de sessão — port 1:1 do `state` da referência (docs/reference/index.html
 * L367–379) e do reset feito por segment() (L454–462). PRD v2 §6.3–§6.4, §11.
 *
 * Shape COMPLETO da sessão (ENG-216): issues posteriores ADICIONAM FUNÇÕES,
 * nunca editam este módulo. Ficam FORA do domínio os campos de UI/playback da
 * referência: `color`, `beadSize`, `playing`, `paused`, `dlRet`, `dlMan`,
 * `mapStep`/`mapN1i`/`mapN2i`/`mapN3i` (andaime de tela), `whole.label`
 * ("O colar" — copy de exibição, fora de qualquer artefato) e `audioBuffer` (IO).
 *
 * Desvio DELIBERADO de tipo: `whole.span` é não-nulo — na referência ele nasce
 * `null` e só existe entre segment() e o uso; aqui `createSession` é o único
 * construtor e sempre o define (0…N−1), então o tipo prova a invariante.
 */

import type { Bead } from './grid';

export interface Span {
  s: number;
  e: number;
}

export type Layer = 'whole' | 'parts' | 'frases';
export type Mode = 'escuta' | 'triagem' | 'segmentacao' | 'mapeamento';
export type TagState = 'pending' | 'tagged' | 'none_fit';
export type Confidence = 'high' | 'medium' | 'low';

export interface ScenePart {
  part_id: string;
  span: Span | null;
  locked: boolean;
  scene_kind: string | null;
  scene_kind_confidence: Confidence | null;
  tag_state: TagState;
}

export interface Frase {
  prop_id: string;
  statement: string;
  qa: string[];
  span: Span | null;
  part_link: string | null;
  locked: boolean;
}

export interface Current {
  layer: Layer;
  index: number;
}

/** Respostas do Mapeamento (referência L1058): chave = k da pergunta;
 *  level2/level3 indexados por part_id / prop_id. Comportamento na ENG-226. */
export interface Mapping {
  level1: Record<string, string>;
  level2: Record<string, Record<string, string>>;
  level3: Record<string, Record<string, string>>;
}

export interface Whole {
  id: 'S1';
  span: Span;
  confirmed: boolean;
}

export interface SessionState {
  durationSec: number;
  beadSec: number;
  totalBeads: number;
  beads: Bead[];
  manifestId: string;
  audioFilename: string;
  slug: string;
  whole: Whole;
  parts: ScenePart[];
  partsConfirmed: boolean;
  frases: Frase[];
  current: Current;
  activeSceneId: string | null;
  mapping: Mapping | null;
  selection: Span | null;
  pendingStart: number | null;
  mode: Mode;
  review: boolean;
}

export interface SessionInit {
  durationSec: number;
  beadSec: number;
  beads: Bead[];
  manifestId: string;
  audioFilename: string;
  slug: string;
}

export function createSession(init: SessionInit): SessionState {
  const totalBeads = init.beads.length;
  return {
    durationSec: init.durationSec,
    beadSec: init.beadSec,
    totalBeads,
    beads: init.beads,
    manifestId: init.manifestId,
    audioFilename: init.audioFilename,
    slug: init.slug,
    whole: { id: 'S1', span: { s: 0, e: totalBeads - 1 }, confirmed: false },
    parts: [],
    partsConfirmed: false,
    frases: [],
    current: { layer: 'whole', index: -1 },
    activeSceneId: null,
    mapping: null,
    selection: null,
    pendingStart: null,
    mode: 'escuta',
    review: false,
  };
}
