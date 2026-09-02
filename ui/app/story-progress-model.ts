import { productiveScenes, type SessionState } from '../../domain';
import type { TodayGoal } from '../state';

/**
 * O quanto a HISTÓRIA INTEIRA já andou, em porcentagem (protótipo v4, linhas
 * 1644-1657). Cada etapa vale um pedaço do todo — as Frases valem mais de três
 * vezes a Escuta porque é onde se passa o tempo — e dentro da etapa atual conta-se
 * a fração já cumprida. Etapas concluídas contam o peso inteiro, então a barra só
 * anda para a frente ao mudar de estação.
 *
 * Mora em ui/app, ao lado de `stepper-model.ts`, pelo mesmo motivo que ele: é
 * derivação de VISTA a partir de `SessionState`, e o shell é a única camada que
 * vê ao mesmo tempo o estado do domínio e os fatos locais da vista (quanto já se
 * ouviu). Não é domínio: os pesos abaixo são uma escolha de desenho, não uma regra
 * do PRD, e nada disto entra em artefato nenhum — `domain/` continua congelado.
 *
 * TODA fração aqui é uma divisão, e vários denominadores são zero numa sessão
 * real: sessão sem cena, sem cena produtiva. São só DUAS portas de divisão no
 * módulo, e nenhuma das duas deixa passar denominador não positivo: `ratio`, do
 * progresso, devolve 0; `share`, da meta, piso o denominador em 1. Um `NaN`
 * chegando ao `width` do CSS não dá erro — some com a barra, calado.
 *
 * Desde a ENG-653 a barra também carrega a MARCA da meta de hoje, e por isso o
 * módulo tem uma entrada só (`storyBarValues`).
 */

/**
 * Peso de cada etapa no todo, somando 100 (ENG-725). Não são mais os pesos do
 * protótipo v4 reescalados (ENG-689: 13, 23, 20, 44): são as DIVISÓRIAS do desenho
 * da Rever — `docs/design/revisao-tela-nova.html`, a barra do topo, em 10%, 32%, 52% e
 * 88% —, lidas como pesos. O desenho vence (CLAUDE.md, regra 2), e é ele que dá à
 * Rever a fatia final.
 */
export const STATION_WEIGHTS: readonly number[] = [10, 22, 20, 36, 12];

/** As quatro fronteiras entre as cinco etapas, em porcentagem: 10, 32, 52, 88. */
export const STAGE_BOUNDARIES: readonly number[] = STATION_WEIGHTS.slice(0, -1).reduce<number[]>(
  (acc, weight) => [...acc, (acc.at(-1) ?? 0) + weight],
  [],
);

/** Quantas cenas fazem uma história inteira, para efeito de barra (protótipo). */
const SCENES_FOR_A_WHOLE_STORY = 5;

export interface StoryProgressInput {
  session: SessionState;
  /** Posição da estação atual no fluxo (0–4); negativo = fora do fluxo. */
  stationIndex: number;
  /** Contas da história já ouvidas na Escuta 1. */
  heardBeads: number;
}

function ratio(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(1, Math.max(0, part / whole));
}

/** Fração cumprida DENTRO da etapa `index` (0–1). */
function stationFraction(index: number, input: StoryProgressInput): number {
  const { session } = input;
  switch (index) {
    case 0:
      return ratio(input.heardBeads, session.totalBeads);
    case 1:
      return ratio(session.parts.length, SCENES_FOR_A_WHOLE_STORY);
    case 2:
      return ratio(
        session.parts.filter((p) => p.tag_state !== 'pending').length,
        session.parts.length,
      );
    case 3: {
      const productive = productiveScenes(session);
      const withPhrase = productive.filter((scene) =>
        session.frases.some((f) => f.part_link === scene.part_id),
      ).length;
      return ratio(withPhrase, productive.length);
    }
    // a Rever não tem sub-passo (ENG-725): entrar nela é a fatia inteira
    default:
      return 1;
  }
}

/** Porcentagem da história inteira, arredondada a uma casa (como o protótipo). */
function storyProgressPercent(input: StoryProgressInput): number {
  if (input.stationIndex < 0) return 0;
  const index = Math.min(input.stationIndex, STATION_WEIGHTS.length - 1);
  const done = STATION_WEIGHTS.slice(0, index).reduce((a, b) => a + b, 0);
  return Math.round((done + stationFraction(index, input) * STATION_WEIGHTS[index]!) * 10) / 10;
}

/**
 * Onde a meta de hoje cai NA MESMA barra (protótipo v4, `_goalPct`, linhas
 * 1375-1379). Os âncoras não são arbitrários: 32 e 52 são os fins da Escuta 2 e da
 * Triagem sob os pesos acima, e 36 é a largura da faixa das Frases — por isso
 * "2 cenas" quer dizer *duas cenas com frase*, caindo dentro dessa faixa. Derivar
 * daqui, e não copiar os números, é o que mantém marca e preenchimento no mesmo
 * sistema de coordenadas caso os pesos mudem.
 */
function goalPercent(goal: TodayGoal, session: SessionState): number {
  switch (goal) {
    case 'triage':
      return TRIAGE_END;
    case 'wholeStory':
    case 'phrases':
      return 100;
    case 'twoScenes':
      return TRIAGE_END + share(2, sceneCount(session)) * PHRASES_WEIGHT;
    default:
      return TRIAGE_END + share(4, sceneCount(session)) * PHRASES_WEIGHT;
  }
}

/**
 * Fim da Triagem: o âncora das metas por contagem de cena. Fechar as Frases e "a
 * história toda" continuam a MESMA marca, a ponta da barra: a Rever enche a barra
 * ao ser alcançada (ENG-725), então as duas metas se cumprem no mesmo instante.
 */
const TRIAGE_END = STAGE_BOUNDARIES[2]!;
const PHRASES_WEIGHT = STATION_WEIGHTS[3]!;

/**
 * Quantas cenas a meta divide. Sessão ainda sem cena recua para quatro (protótipo):
 * sem o recuo, `2/0` satura em 1 e "2 cenas" cairia exatamente sobre "fechar as
 * Frases" — duas metas diferentes, a mesma marca, e ninguém para denunciar.
 */
function sceneCount(session: SessionState): number {
  return Math.max(1, session.parts.length || 4);
}

/** Fração de uma contagem, com o denominador sempre positivo. */
function share(want: number, have: number): number {
  return Math.min(1, want / Math.max(1, have));
}

export interface StoryBarValues {
  /** 0–100: o quanto da história inteira já foi feito. */
  percent: number;
  /** 0–100 onde a meta de hoje cai, ou `null` quando não há meta escolhida. */
  goalAt: number | null;
}

/** Os dois números da barra do topo, numa passagem só. */
export function storyBarValues(input: StoryProgressInput, goal: TodayGoal | null): StoryBarValues {
  return {
    percent: storyProgressPercent(input),
    goalAt: goal === null ? null : goalPercent(goal, input.session),
  };
}
