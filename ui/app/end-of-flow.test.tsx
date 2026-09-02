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
 * O fluxo termina na Rever (ENG-725), a quinta estação, que entra entre o fim das
 * Frases e a tela de conclusão. A conversa, o relatório e a exportação
 * continuam fora do produto (ENG-689) — os cortes, as cenas e as frases seguem
 * salvos pelo autosave, para outro sistema consumir.
 *
 * O que se afirma aqui é o FIM: quantas estações o fio tem, que a última é a
 * Rever e que ela é a atual depois de o domínio encerrar a sessão, como a barra
 * do topo reparte a história entre as cinco, e que nenhuma rota do app monta uma
 * das telas que saíram.
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

/** Sessão parada no começo de cada uma das cinco estações do fluxo. */
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
  /**
   * O que o domínio guarda depois de a última cena produtiva fechar: o modo vira
   * `concluida` (ENG-691) — e é aí que a Rever entra (ENG-725).
   */
  review: (): SessionState => ({
    ...base(),
    mode: 'concluida',
    whole: heard,
    partsConfirmed: true,
    parts: [part('PT1', true)],
    frases: [frase('P1', 'PT1')],
  }),
};

function band(session: SessionState): HTMLElement {
  const { container } = render(<StoryProgress session={session} />);
  return container.querySelector<HTMLElement>('.cds-story-progress')!;
}

function fillWidth(session: SessionState): number {
  const el = band(session).querySelector<HTMLElement>('.cds-story-progress-fill');
  return Number.parseFloat(el!.style.width);
}

function dividers(session: SessionState): number[] {
  return [...band(session).querySelectorAll<HTMLElement>('.cds-story-progress-tick')].map((el) =>
    Number.parseFloat(el.style.left),
  );
}

beforeEach(() => {
  progressStore.getState().reset();
  goalStore.setState(goalStore.getInitialState(), true);
});

describe('O fio tem cinco estações e acaba na Rever (ENG-725)', () => {
  it('as estações são Ouvir, Cortar, Triagem, Frases e Rever, nesta ordem', () => {
    expect(stepperStations(base()).map((s) => s.key)).toEqual([
      'listen',
      'cut',
      'triage',
      'phrases',
      'review',
    ]);
  });

  it('fechada a última cena produtiva, a Rever passa a ser a estação atual', () => {
    const stations = stepperStations(AT.review());
    expect(stations.find((s) => s.state === 'current')?.key).toBe('review');
  });

  it('não sobra nenhuma estação futura quando a sessão está na Rever', () => {
    expect(stepperStations(AT.review()).map((s) => s.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'current',
    ]);
  });

  /**
   * As Frases ficam alcançáveis assim que há uma cena produtiva; a Rever só
   * quando o domínio encerrou a sessão — antes disso ela é futura e travada.
   */
  it('a Rever só fica alcançável com a sessão encerrada pelo domínio', () => {
    const before = stepperStations(AT.phrases());
    expect(before.find((s) => s.key === 'phrases')?.reachable).toBe(true);
    expect(before.at(-1)?.reachable).toBe(false);
    expect(stepperStations(AT.review()).at(-1)?.reachable).toBe(true);
  });
});

describe('A barra do topo reparte a história entre as cinco estações (ENG-725)', () => {
  it('as divisórias caem em dez, trinta e dois, cinquenta e dois e oitenta e oito por cento', () => {
    expect(dividers(AT.listen())).toEqual([10, 32, 52, 88]);
  });

  it('cada estação começa na sua divisória', () => {
    expect(fillWidth(AT.listen())).toBe(0);
    expect(fillWidth(AT.cut())).toBe(10);
    expect(fillWidth(AT.triage())).toBe(32);
    expect(fillWidth(AT.phrases())).toBe(52);
  });

  it('estar na Rever enche a barra: ela não tem sub-passo', () => {
    // mesmo sem frase nenhuma: entrar na Rever é a fatia inteira, não uma fração
    expect(fillWidth({ ...AT.review(), frases: [] })).toBe(100);
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

  it('a faixa da sessão encerrada anuncia a Rever, e nenhuma etapa depois dela', () => {
    const faixa = band(AT.review());
    expect(within(faixa).getByText('Rever')).toBeDefined();
    expect(faixa.textContent?.trim()).toBe('Rever');
  });
});
