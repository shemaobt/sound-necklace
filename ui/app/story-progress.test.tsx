import { render, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildBeads,
  createSession,
  ensureMapping,
  questionSequence,
  setAnswer,
  type Frase,
  type ScenePart,
  type SessionState,
} from '../../domain';
import { progressStore } from '../state';
import { StoryProgress } from './story-progress';

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

const heard = { id: 'S1' as const, span: { s: 0, e: TOTAL_BEADS - 1 }, confirmed: true };

/** Sessão parada em cada uma das seis estações do fluxo. */
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
  conversation: (): SessionState => ({
    ...base(),
    mode: 'mapeamento',
    whole: heard,
    partsConfirmed: true,
    parts: [part('PT1', true)],
    frases: [frase('P1', 'PT1')],
  }),
};

function band(session: SessionState, viewingExport = false): HTMLElement {
  const { container } = render(<StoryProgress session={session} viewingExport={viewingExport} />);
  return container.querySelector<HTMLElement>('.cds-story-progress')!;
}

function fillWidth(session: SessionState, viewingExport = false): number {
  const el = band(session, viewingExport).querySelector<HTMLElement>('.cds-story-progress-fill');
  return Number.parseFloat(el!.style.width);
}

beforeEach(() => {
  progressStore.getState().reset();
});

describe('StoryProgress — uma barra no topo, para a história inteira (ENG-648)', () => {
  it('cada estação diz o próprio nome, e nenhuma diz o das outras', () => {
    const esperado: [SessionState, boolean, string][] = [
      [AT.listen(), false, 'Ouvir'],
      [AT.cut(), false, 'Cortar'],
      [AT.triage(), false, 'Triagem'],
      [AT.phrases(), false, 'Frases'],
      [AT.conversation(), false, 'Conversa'],
      [AT.conversation(), true, 'Guardar'],
    ];
    for (const [session, viewingExport, nome] of esperado) {
      const faixa = band(session, viewingExport);
      expect(within(faixa).getByText(nome)).toBeDefined();
      expect(faixa.textContent?.trim()).toBe(nome);
    }
  });

  it('a barra só anda para a frente ao longo do fluxo inteiro', () => {
    // Cada degrau é um estado da sessão mais adiantado que o anterior — meia
    // história ouvida, história inteira ouvida, cenas cortadas, triadas, e assim
    // por diante. O que se afirma é a ORDEM, nunca uma porcentagem.
    const conversaRespondida = ((): SessionState => {
      const s = ensureMapping(AT.conversation());
      return setAnswer(s, questionSequence(s)[0]!, 'uma resposta');
    })();
    const degraus: (() => number)[] = [
      () => fillWidth(AT.listen()),
      () => {
        progressStore.getState().noteHeard(TOTAL_BEADS / 2);
        return fillWidth(AT.listen());
      },
      () => {
        progressStore.getState().noteHeard(TOTAL_BEADS);
        return fillWidth(AT.listen());
      },
      () => fillWidth(AT.cut()),
      () => fillWidth({ ...AT.cut(), parts: [part('PT1', false), part('PT2', false)] }),
      () => fillWidth(AT.triage()),
      () => fillWidth({ ...AT.triage(), parts: [part('PT1', true)] }),
      () => fillWidth(AT.phrases()),
      () => fillWidth({ ...AT.phrases(), frases: [frase('P1', 'PT1')] }),
      () => fillWidth(AT.conversation()),
      () => fillWidth(conversaRespondida),
      () => fillWidth(AT.conversation(), true),
      () => {
        progressStore.getState().noteDownloaded(3);
        return fillWidth(AT.conversation(), true);
      },
    ];

    const larguras = degraus.map((passo) => passo());
    for (const largura of larguras) expect(Number.isFinite(largura)).toBe(true);
    for (let i = 1; i < larguras.length; i++) {
      expect(larguras[i]!).toBeGreaterThanOrEqual(larguras[i - 1]!);
    }
    expect(larguras.at(-1)!).toBeGreaterThan(larguras[0]!);
  });

  /**
   * As duas estações cujo denominador é o que a sessão ainda não tem: a Triagem
   * divide pelo número de cenas, as Frases pelo de cenas produtivas. Estar numa
   * estação ANTERIOR não serve de teste — lá o denominador é `totalBeads`, que é
   * sempre positivo, e o zero-a-dividir nunca chega a se formar.
   *
   * São duas afirmações com alvos diferentes, e é de propósito. "Nenhum estilo
   * com NaN" segura o clamp da molécula. "A barra desenha o caminho já andado"
   * segura a divisão do modelo: com `ratio` devolvendo `NaN`, o clamp da molécula
   * o transforma em zero e a barra COLAPSA para vazia — silenciosamente, e sem
   * um só `NaN` no DOM para denunciar. Quem chegou à Triagem já ouviu e já cortou;
   * a barra tem de mostrar isso.
   */
  function expectDrawsWithGroundCovered(session: SessionState, viewingExport = false): void {
    const faixa = band(session, viewingExport);
    expect(faixa.querySelector('.cds-story-progress-fill')).not.toBeNull();
    for (const el of faixa.querySelectorAll('[style]')) {
      expect(el.getAttribute('style')).not.toMatch(/NaN|Infinity/);
    }
    expect(fillWidth(session, viewingExport)).toBeGreaterThan(0);
  }

  it('na Triagem sem nenhuma cena, a barra ainda mostra o caminho já andado', () => {
    expectDrawsWithGroundCovered({
      ...base(),
      mode: 'triagem',
      whole: heard,
      partsConfirmed: true,
      parts: [],
    });
  });

  it('nas Frases sem nenhuma cena produtiva, a barra ainda mostra o caminho já andado', () => {
    // uma cena por classificar não é produtiva (domain `productiveScenes`)
    expectDrawsWithGroundCovered({
      ...base(),
      mode: 'segmentacao',
      whole: heard,
      partsConfirmed: true,
      parts: [part('PT1', false)],
    });
  });

  it('não mostra dígito algum ao ouvinte (§9.2)', () => {
    const faixa = band(AT.conversation());
    expect(faixa.textContent ?? '').not.toMatch(/\d/);
    for (const el of faixa.querySelectorAll('[aria-label], [title]')) {
      expect(`${el.getAttribute('aria-label') ?? ''}${el.getAttribute('title') ?? ''}`).not.toMatch(
        /\d/,
      );
    }
  });
});
