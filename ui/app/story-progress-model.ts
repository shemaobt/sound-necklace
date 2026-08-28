import { productiveScenes, questionSequence, type SessionState } from '../../domain';
import { lastAnsweredIndex } from '../pages/conversation/answered';
import type { TodayGoal } from '../state';

/**
 * O quanto a HISTÓRIA INTEIRA já andou, em porcentagem (protótipo v4, linhas
 * 1644-1657). Cada etapa vale um pedaço do todo — a Conversa vale quatro vezes a
 * Escuta porque é onde se passa o tempo — e dentro da etapa atual conta-se a
 * fração já cumprida. Etapas concluídas contam o peso inteiro, então a barra só
 * anda para a frente ao mudar de estação.
 *
 * Mora em ui/app, ao lado de `stepper-model.ts`, pelo mesmo motivo que ele: é
 * derivação de VISTA a partir de `SessionState`, e o shell é a única camada que
 * vê ao mesmo tempo o estado do domínio e os fatos locais da vista (estar na
 * cauda Guardar, quanto já se ouviu, quantos artefatos já se baixou). Não é
 * domínio: os pesos abaixo são uma escolha de desenho, não uma regra do PRD, e
 * nada disto entra em artefato nenhum — `domain/` continua congelado.
 *
 * TODA fração aqui é uma divisão, e vários denominadores são zero numa sessão
 * real: sessão sem cena, sem cena produtiva, entrevista curta. São só DUAS portas
 * de divisão no módulo, e nenhuma das duas deixa passar denominador não positivo:
 * `ratio`, do progresso, devolve 0; `share`, da meta, piso o denominador em 1. Um
 * `NaN` chegando ao `width` do CSS não dá erro — some com a barra, calado.
 *
 * Desde a ENG-653 a barra também carrega a MARCA da meta de hoje, e por isso o
 * módulo tem uma entrada só (`storyBarValues`): as duas contas podem precisar da
 * mesma caminhada pela entrevista, e ela é feita no máximo uma vez por chamada.
 */

/** Peso de cada etapa no todo (`W6` do protótipo), somando 100. */
export const STATION_WEIGHTS: readonly number[] = [8, 14, 12, 26, 32, 8];

/** As cinco fronteiras entre as seis etapas, em porcentagem: 8, 22, 34, 60, 92. */
export const STAGE_BOUNDARIES: readonly number[] = STATION_WEIGHTS.slice(0, -1).reduce<number[]>(
  (acc, weight) => [...acc, (acc.at(-1) ?? 0) + weight],
  [],
);

/** Quantas cenas fazem uma história inteira, para efeito de barra (protótipo). */
const SCENES_FOR_A_WHOLE_STORY = 5;
/** Retorno de ancoragem, manifesto e relatório. */
const ARTIFACTS = 3;

export interface StoryProgressInput {
  session: SessionState;
  /** Posição da estação atual no fluxo (0–5); negativo = fora do fluxo. */
  stationIndex: number;
  /** Contas da história já ouvidas na Escuta 1. */
  heardBeads: number;
  /** Artefatos já baixados na Guardar (0–3). */
  artifactsDownloaded: number;
  /** Caminhos com resposta gravada (`meta.voice`) — voz também é resposta. */
  voice: readonly string[];
}

function ratio(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(1, Math.max(0, part / whole));
}

/** Fração cumprida DENTRO da etapa `index` (0–1). */
function stationFraction(
  index: number,
  input: StoryProgressInput,
  questionCount: () => number,
): number {
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
    case 4:
      // a pergunta em foco é a seguinte à última respondida; a entrevista está
      // cheia quando se chega à última, daí o `total - 1` do protótipo
      return ratio(lastAnsweredIndex(session, input.voice) + 1, questionCount() - 1);
    default:
      return ratio(input.artifactsDownloaded, ARTIFACTS);
  }
}

/** Porcentagem da história inteira, arredondada a uma casa (como o protótipo). */
function storyProgressPercent(input: StoryProgressInput, questionCount: () => number): number {
  if (input.stationIndex < 0) return 0;
  const index = Math.min(input.stationIndex, STATION_WEIGHTS.length - 1);
  const done = STATION_WEIGHTS.slice(0, index).reduce((a, b) => a + b, 0);
  return (
    Math.round(
      (done + stationFraction(index, input, questionCount) * STATION_WEIGHTS[index]!) * 10,
    ) / 10
  );
}

/**
 * Onde a meta de hoje cai NA MESMA barra (protótipo v4, `_goalPct`, linhas
 * 1375-1379). Os âncoras não são arbitrários: 34 e 60 são os fins da Triagem e das
 * Frases sob os pesos acima, e 26 e 32 as larguras dessas duas faixas — por isso
 * "2 cenas" quer dizer *duas cenas com frase*, caindo dentro da faixa das Frases,
 * e "12 conversas" cai dentro da faixa da Conversa. Derivar daqui, e não copiar os
 * números, é o que mantém marca e preenchimento no mesmo sistema de coordenadas
 * caso os pesos mudem.
 */
function goalPercent(goal: TodayGoal, session: SessionState, questionCount: () => number): number {
  switch (goal) {
    case 'triage':
      return TRIAGE_END;
    case 'phrases':
      return PHRASES_END;
    case 'wholeStory':
      return 100;
    case 'twoScenes':
      return TRIAGE_END + share(2, sceneCount(session)) * PHRASES_WEIGHT;
    case 'fourScenes':
      return TRIAGE_END + share(4, sceneCount(session)) * PHRASES_WEIGHT;
    default:
      return PHRASES_END + share(12, questionCount()) * CONVERSATION_WEIGHT;
  }
}

/** Fim da Triagem e fim das Frases: os dois âncoras das metas por contagem. */
const TRIAGE_END = STAGE_BOUNDARIES[2]!;
const PHRASES_END = STAGE_BOUNDARIES[3]!;
const PHRASES_WEIGHT = STATION_WEIGHTS[3]!;
const CONVERSATION_WEIGHT = STATION_WEIGHTS[4]!;

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

/**
 * Os dois números da barra do topo, numa passagem só. A caminhada pela entrevista
 * (`questionSequence`) é cara e as duas contas podem precisar dela — a fração da
 * Conversa e a meta de "12 conversas" —, então ela é preguiçosa e acontece no
 * MÁXIMO uma vez por chamada: nem a barra ganha uma segunda varredura da sessão,
 * nem paga a primeira quando ninguém precisa.
 */
export function storyBarValues(input: StoryProgressInput, goal: TodayGoal | null): StoryBarValues {
  let plan: number | null = null;
  const questionCount = (): number => (plan ??= questionSequence(input.session).length);
  return {
    percent: storyProgressPercent(input, questionCount),
    goalAt: goal === null ? null : goalPercent(goal, input.session, questionCount),
  };
}
