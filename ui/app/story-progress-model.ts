import { productiveScenes, questionSequence, type SessionState } from '../../domain';
import { lastAnsweredIndex } from '../pages/conversation/answered';

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
 * real: sessão sem cena, sem cena produtiva, entrevista de uma pergunta só. `ratio`
 * é a única porta de divisão do módulo, e devolve 0 quando o denominador não é um
 * número positivo — um `NaN` chegando ao `width` do CSS não dá erro, some com a
 * barra.
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
    case 4:
      // a pergunta em foco é a seguinte à última respondida; a entrevista está
      // cheia quando se chega à última, daí o `total - 1` do protótipo
      return ratio(
        lastAnsweredIndex(session, input.voice) + 1,
        questionSequence(session).length - 1,
      );
    default:
      return ratio(input.artifactsDownloaded, ARTIFACTS);
  }
}

/** Porcentagem da história inteira, arredondada a uma casa (como o protótipo). */
export function storyProgressPercent(input: StoryProgressInput): number {
  if (input.stationIndex < 0) return 0;
  const index = Math.min(input.stationIndex, STATION_WEIGHTS.length - 1);
  const done = STATION_WEIGHTS.slice(0, index).reduce((a, b) => a + b, 0);
  return Math.round((done + stationFraction(index, input) * STATION_WEIGHTS[index]!) * 10) / 10;
}
