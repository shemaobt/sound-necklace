import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import type { SessionState } from '../../domain';
import { StoryProgressBar } from '../molecules';
import { useGoalStore, useProgressStore } from '../state';
import { stepperStations } from './stepper-model';
import { STAGE_BOUNDARIES, storyBarValues } from './story-progress-model';
import './story-progress.css';

/**
 * A faixa de progresso do topo (protótipo v4, linhas 269-277): o NOME da etapa
 * atual sobre a barra da história inteira. Fica logo abaixo do cabeçalho, em toda
 * estação — a Setup não a tem porque não é uma estação do fio, e o shell nem
 * monta esta faixa fora de uma sessão aberta.
 *
 * O nome é uma palavra, nunca uma contagem (§9.2): "TRIAGEM", jamais "3 de 6". Vai
 * `aria-hidden` como ia no fio de contas, porque quem anuncia as etapas a leitores
 * de tela é o `<ol>` rotulado do fio, logo abaixo — dois anúncios da mesma coisa
 * seriam ruído.
 *
 * Lê o quanto já se ouviu e quantos artefatos já se baixou do `progressStore`
 * aqui dentro, e não por prop, de propósito: a Escuta 1 publica a cada conta nova,
 * e assinar isso no shell faria a sessão inteira re-renderizar durante a
 * reprodução. Assinando aqui, só esta faixa re-renderiza.
 *
 * A MARCA da meta de hoje (ENG-653) sai daqui pelo mesmo caminho: a meta se lê do
 * `goalStore` aqui dentro, e a barra recebe onde ela cai. Recalcular a cada render é
 * de propósito — o número de cenas e de perguntas cresce durante o trabalho, e a
 * marca de "2 cenas" tem de andar junto —, e é por isso que progresso e meta saem de
 * uma chamada só a `storyBarValues`: duas chamadas seriam duas varreduras da sessão
 * por render, que foi exatamente o que fez uma suíte de conversa estourar na ENG-648.
 *
 * Quem AVISA que a meta chegou é esta faixa, porque é aqui que os dois números se
 * encontram; quem decide o que fazer com o aviso é o shell, o único que sabe se há
 * outra tela cheia no ar.
 *
 * Os caminhos de voz chegam como GETTER, não como array: assim a leitura do ref de
 * `meta.voice` — que o próprio App documenta como proibida em render (ENG-321) —
 * sai do render do shell, e a prop tem identidade estável (`useCallback`) em vez de
 * um array novo a cada render vindo do `?? []`. Estável é o que o React Compiler
 * precisa para memoizar esta faixa sozinho; um `useMemo` à mão aqui DESLIGA a
 * compilação do componente inteiro (`react-hooks` reprova, e com razão) e sai pior
 * do que não ter memo nenhum.
 */
export function StoryProgress({
  session,
  viewingExport = false,
  voicePaths = noVoice,
  onGoalReached,
}: {
  session: SessionState;
  /** O shell está na cauda Guardar (estado local dele — ver stepper-model). */
  viewingExport?: boolean;
  /** Getter dos caminhos com resposta gravada (`meta.voice`) — ver acima. */
  voicePaths?: () => readonly string[];
  /**
   * O progresso alcançou (ou deixou de alcançar) a meta de hoje. Recebe o estado,
   * não um evento, para que o shell possa passar um `setState` direto: identidade
   * estável sem `useCallback`, que é o que a memoização desta faixa precisa.
   */
  onGoalReached?: (reached: boolean) => void;
}) {
  const { t } = useTranslation();
  const heardBeads = useProgressStore((s) => s.heardBeads);
  const artifactsDownloaded = useProgressStore((s) => s.artifactsDownloaded);
  const goal = useGoalStore((s) => s.goal);

  const stations = stepperStations(session, { viewingExport });
  const stationIndex = stations.findIndex((s) => s.state === 'current');
  const current = stations[stationIndex];

  const { percent, goalAt } = storyBarValues(
    {
      session,
      stationIndex,
      heardBeads,
      artifactsDownloaded,
      voice: voicePaths(),
    },
    goal,
  );

  // a mesma folga do protótipo: as duas pontas vêm de arredondamentos diferentes, e
  // exigir igualdade exata deixaria a meta por alcançar por um centésimo
  const reached = goalAt !== null && percent >= goalAt - 0.01;
  useEffect(() => {
    onGoalReached?.(reached);
  }, [reached, onGoalReached]);

  if (!current) return null;

  return (
    <div className="cds-story-progress">
      <p className="cds-story-progress-name" aria-hidden="true">
        {t(current.labelKey)}
      </p>
      <StoryProgressBar percent={percent} dividers={STAGE_BOUNDARIES} goal={goalAt} />
    </div>
  );
}

const NO_VOICE: readonly string[] = [];
/** Identidade estável: um `() => []` novo a cada render furaria a memoização. */
const noVoice = (): readonly string[] => NO_VOICE;
