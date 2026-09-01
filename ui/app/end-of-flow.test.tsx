import { render, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildBeads,
  createSession,
  type Frase,
  type ScenePart,
  type SessionState,
} from '../../domain';
import { goalStore, progressStore } from '../state';
import { buildStationRegistry } from './registries';
import { stepperStations } from './stepper-model';
import { StoryProgress } from './story-progress';

/**
 * O fluxo termina nas Frases (ENG-689). A conversa, o relatório e a exportação
 * saíram do produto — os cortes, as cenas e as frases continuam salvos pelo
 * autosave, para outro sistema consumir.
 *
 * O que se afirma aqui é o FIM: quantas estações o fio tem, que a última é Frases
 * mesmo depois de o domínio ter encerrado a sessão, como a barra do topo reparte
 * a história entre as quatro, e que nenhuma rota do app monta uma das telas que
 * saíram.
 */

const TOTAL_BEADS = 8;

function base(): SessionState {
  return createSession({
    durationSec: 4,
    beadSec: 0.5,
    beads: buildBeads(4, 0.5),
    manifestId: 'fnv1a32:deadbeef',
    audioFilename: 'h.wav',
    slug: 'h',
  });
}

const heard = { id: 'S1' as const, span: { s: 0, e: TOTAL_BEADS - 1 }, confirmed: true };

function part(id: string, tagged: boolean): ScenePart {
  return {
    part_id: id,
    span: { s: 0, e: 3 },
    locked: true,
    scene_kind: tagged ? 'BIRTH_SCENE' : null,
    scene_kind_confidence: tagged ? 'high' : null,
    tag_state: tagged ? 'tagged' : 'pending',
  };
}

function frase(id: string, partId: string): Frase {
  return {
    prop_id: id,
    statement: '',
    qa: [],
    span: { s: 0, e: 1 },
    part_link: partId,
    locked: true,
  };
}

/** Sessão parada no começo de cada uma das quatro estações do fluxo. */
const AT = {
  listen: (): SessionState => base(),
  cut: (): SessionState => ({ ...base(), whole: heard }),
  triage: (): SessionState => ({
    ...base(),
    mode: 'triagem',
    whole: heard,
    partsConfirmed: true,
    parts: [part('PT1', false)],
  }),
  phrases: (): SessionState => ({
    ...base(),
    mode: 'segmentacao',
    whole: heard,
    partsConfirmed: true,
    parts: [part('PT1', true)],
  }),
};

/**
 * O que o domínio guarda depois de a última cena produtiva fechar: o modo vira
 * `concluida` (ENG-691) — o trabalho acabou, e não há estação depois.
 */
function phrasesDone(): SessionState {
  return {
    ...AT.phrases(),
    mode: 'concluida',
    frases: [frase('P1', 'PT1')],
  };
}

function band(session: SessionState): HTMLElement {
  const { container } = render(<StoryProgress session={session} />);
  return container.querySelector<HTMLElement>('.cds-story-progress')!;
}

function fillWidth(session: SessionState): number {
  const el = band(session).querySelector<HTMLElement>('.cds-story-progress-fill');
  return Number.parseFloat(el!.style.width);
}

beforeEach(() => {
  progressStore.getState().reset();
  goalStore.setState(goalStore.getInitialState(), true);
});

describe('O fio tem quatro estações e acaba nas Frases (ENG-689)', () => {
  it('as estações são Ouvir, Cortar, Triagem e Frases, nesta ordem', () => {
    expect(stepperStations(base()).map((s) => s.key)).toEqual([
      'listen',
      'cut',
      'triage',
      'phrases',
    ]);
  });

  it('fechada a última cena produtiva, Frases continua sendo a estação atual', () => {
    const stations = stepperStations(phrasesDone());
    expect(stations.find((s) => s.state === 'current')?.key).toBe('phrases');
    expect(stations.filter((s) => s.state === 'future')).toEqual([]);
  });

  /**
   * A última conta do fio deixou de depender de um gate de entrevista: chegar ao
   * fim é ter uma cena produtiva à frente, não ter uma frase travada dentro dela.
   */
  it('a última estação fica alcançável assim que há uma cena produtiva', () => {
    const stations = stepperStations(AT.phrases());
    expect(stations.at(-1)?.reachable).toBe(true);
  });
});

describe('A barra do topo reparte a história entre as quatro estações (ENG-689)', () => {
  it('cada estação começa na sua fronteira, e as quatro somam a história inteira', () => {
    expect(fillWidth(AT.listen())).toBe(0);
    expect(fillWidth(AT.cut())).toBe(13);
    expect(fillWidth(AT.triage())).toBe(36);
    expect(fillWidth(AT.phrases())).toBe(56);
  });

  it('a última cena produtiva com frase enche a barra: a história está inteira', () => {
    expect(fillWidth(phrasesDone())).toBe(100);
  });
});

describe('Nenhuma rota alcança a conversa, o relatório ou a exportação (ENG-689)', () => {
  it('a tabela de estações do app não tem nenhuma das três', () => {
    const keys = Object.keys(buildStationRegistry());
    expect(keys).toContain('phrases');
    for (const ida of ['conversation', 'report', 'export']) {
      expect(keys, `a estação "${ida}" ainda é montável`).not.toContain(ida);
    }
  });

  it('a faixa da sessão encerrada anuncia Frases, e nenhuma etapa depois dela', () => {
    const faixa = band(phrasesDone());
    expect(within(faixa).getByText('Frases')).toBeDefined();
    expect(faixa.textContent?.trim()).toBe('Frases');
  });
});
