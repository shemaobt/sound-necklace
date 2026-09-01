import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildBeads,
  createSession,
  type Frase,
  type ScenePart,
  type SessionState,
} from '../../domain';
import { goalStore, progressStore, TODAY_GOALS } from '../state';
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

/** Sessão parada em cada uma das quatro estações do fluxo. */
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
  /** Fechada a última cena produtiva o domínio vai a `mapeamento`, que é o fim. */
  phrasesDone: (): SessionState => ({
    ...base(),
    mode: 'mapeamento',
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

beforeEach(() => {
  progressStore.getState().reset();
  goalStore.setState(goalStore.getInitialState(), true);
});

describe('StoryProgress — uma barra no topo, para a história inteira (ENG-648)', () => {
  it('cada estação diz o próprio nome, e nenhuma diz o das outras', () => {
    const esperado: [SessionState, string][] = [
      [AT.listen(), 'Ouvir'],
      [AT.cut(), 'Cortar'],
      [AT.triage(), 'Triagem'],
      [AT.phrases(), 'Frases'],
    ];
    for (const [session, nome] of esperado) {
      const faixa = band(session);
      expect(within(faixa).getByText(nome)).toBeDefined();
      expect(faixa.textContent?.trim()).toBe(nome);
    }
  });

  it('a barra só anda para a frente ao longo do fluxo inteiro', () => {
    // Cada degrau é um estado da sessão mais adiantado que o anterior — meia
    // história ouvida, história inteira ouvida, cenas cortadas, triadas, e assim
    // por diante. O que se afirma é a ORDEM, nunca uma porcentagem.
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
      () => fillWidth(AT.phrasesDone()),
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
  function expectDrawsWithGroundCovered(session: SessionState): void {
    const faixa = band(session);
    expect(faixa.querySelector('.cds-story-progress-fill')).not.toBeNull();
    for (const el of faixa.querySelectorAll('[style]')) {
      expect(el.getAttribute('style')).not.toMatch(/NaN|Infinity/);
    }
    expect(fillWidth(session)).toBeGreaterThan(0);
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
    const faixa = band(AT.phrasesDone());
    expect(faixa.textContent ?? '').not.toMatch(/\d/);
    for (const el of faixa.querySelectorAll('[aria-label], [title]')) {
      expect(`${el.getAttribute('aria-label') ?? ''}${el.getAttribute('title') ?? ''}`).not.toMatch(
        /\d/,
      );
    }
  });
});

/**
 * O anúncio das etapas a quem não vê a tela (ENG-668). Quem nomeava as seis
 * estações era o `<ol>` do fio de contas; com ele fora, é esta faixa que diz em que
 * etapa a sessão está — e diz de novo quando a etapa muda. As asserções são pela
 * árvore de acessibilidade (região nomeada + região viva), nunca por classe.
 */
describe('a faixa diz a etapa a quem não vê a tela (ENG-668)', () => {
  it('a faixa é uma região nomeada e carrega o nome da etapa atual', () => {
    render(<StoryProgress session={AT.triage()} />);

    const regiao = screen.getByRole('region', { name: 'Progresso da sessão' });
    expect(within(regiao).getByText('Triagem')).toBeDefined();
  });

  it('mudou a etapa, mudou o que a faixa anuncia', () => {
    const { rerender } = render(<StoryProgress session={AT.triage()} />);
    const regiao = screen.getByRole('region', { name: 'Progresso da sessão' });
    expect(within(regiao).getByRole('status').textContent).toBe('Triagem');

    rerender(<StoryProgress session={AT.phrases()} />);
    expect(within(regiao).getByRole('status').textContent).toBe('Frases');
  });
});

/**
 * A marca da meta de hoje (ENG-653): a mesma barra ganha um traço fixo onde os
 * dois combinaram chegar. A meta é escolha da facilitadora no Setup e vive no
 * `goalStore`; aqui prova-se o que se VÊ na barra.
 *
 * Toda afirmação é de ORDEM, nunca de porcentagem: fixar um número testaria a
 * aritmética recém-escrita contra ela mesma.
 */

/** Onde a marca está, em porcentagem — lida do `left: calc(N% - 1.5px)`. */
function goalAt(session: SessionState): number | null {
  const el = band(session).querySelector<HTMLElement>('.cds-story-progress-goal');
  if (!el) return null;
  const found = /calc\((-?[\d.]+)%/.exec(el.style.left);
  return found ? Number.parseFloat(found[1]!) : Number.NaN;
}

/** Uma sessão na Triagem com `count` cenas por classificar. */
function triageWith(count: number): SessionState {
  return {
    ...base(),
    mode: 'triagem',
    whole: heard,
    partsConfirmed: true,
    parts: Array.from({ length: count }, (_, i) => part(`PT${i + 1}`, false)),
  };
}

describe('A marca da meta de hoje na barra (ENG-653)', () => {
  it('sem meta escolhida, não há marca nenhuma na barra', () => {
    const faixa = band(AT.phrasesDone());
    expect(faixa.querySelector('.cds-story-progress-goal')).toBeNull();
  });

  it('escolher "fechar a Triagem" põe a marca; escolher de novo a tira', () => {
    goalStore.getState().chooseGoal('triage');
    expect(goalAt(AT.phrasesDone())).not.toBeNull();

    goalStore.getState().chooseGoal('triage');
    expect(goalAt(AT.phrasesDone())).toBeNull();
  });

  /**
   * Desde o corte de escopo (ENG-689) as Frases SÃO o fim da história, então
   * "fechar as Frases" e "a história toda" caem na mesma ponta — de propósito: as
   * duas descrevem hoje o mesmo dia de trabalho. O que continua tendo de valer é a
   * Triagem cair antes delas.
   */
  it('a Triagem fecha antes do fim, e o fim é a ponta da barra', () => {
    goalStore.getState().chooseGoal('triage');
    const triagem = goalAt(AT.phrasesDone())!;
    goalStore.getState().chooseGoal('phrases');
    const frases = goalAt(AT.phrasesDone())!;
    goalStore.getState().chooseGoal('wholeStory');
    const historia = goalAt(AT.phrasesDone())!;

    expect(triagem).toBeLessThan(frases);
    expect(frases).toBe(100);
    expect(historia).toBe(100);
  });

  it('sob a meta de "2 cenas", a marca anda quando o número de cenas muda', () => {
    goalStore.getState().chooseGoal('twoScenes');

    // duas cenas de duas = a meta é o fim das Frases; duas de oito, bem antes
    const deDuas = goalAt(triageWith(2))!;
    const deOito = goalAt(triageWith(8))!;

    expect(deOito).toBeLessThan(deDuas);
  });

  /**
   * O denominador que a sessão real zera: a Triagem antes de existir cena alguma.
   * São duas afirmações com alvos diferentes. "Nada de NaN e a barra desenha o
   * caminho já andado" segura os clamps. "A marca de 2 cenas fica ANTES da marca
   * de fechar as Frases" segura o recuo de quatro cenas: sem ele, `2/0` vira
   * infinito, a fração satura em 1 e as duas metas caem exatamente no mesmo
   * ponto — sem um só NaN no DOM para denunciar.
   */
  it('sem cena nenhuma, a barra e a marca ainda dizem coisas diferentes', () => {
    const semCena = triageWith(0);

    goalStore.getState().chooseGoal('twoScenes');
    const duasCenas = goalAt(semCena)!;
    goalStore.getState().chooseGoal('phrases');
    const fecharFrases = goalAt(semCena)!;

    expect(duasCenas).toBeLessThan(fecharFrases);

    const faixa = band(semCena);
    for (const el of faixa.querySelectorAll('[style]')) {
      expect(el.getAttribute('style')).not.toMatch(/NaN|Infinity/);
    }
    expect(fillWidth(semCena)).toBeGreaterThan(0);
  });

  it('sem cena nenhuma, meta alguma leva NaN ou infinito ao estilo', () => {
    const semCena = triageWith(0);
    for (const meta of TODAY_GOALS) {
      goalStore.setState({ goal: meta });
      const faixa = band(semCena);
      for (const el of faixa.querySelectorAll('[style]')) {
        expect(el.getAttribute('style')).not.toMatch(/NaN|Infinity/);
      }
    }
  });
});
