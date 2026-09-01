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
 * O nome é uma palavra, nunca uma contagem (§9.2): "TRIAGEM", jamais "3 de 4". E é
 * ELE que diz a etapa a quem não vê a tela (ENG-668): o fio de contas saiu, e com ele
 * o `<ol>` rotulado que era o único lugar do DOM a nomear as estações. Esta
 * faixa é agora uma região nomeada — o leitor de tela a encontra e lê "Triagem" —, e o
 * nome vive numa região viva (`role="status"`), de modo que TROCAR de etapa se anuncia
 * sozinho. A região nasce com o texto dentro de propósito: uma região viva criada
 * junto com a sua mensagem não é anunciada (a mesma regra do relatório e dos
 * artefatos), que é exatamente o que se quer na montagem — nada mudou ainda.
 *
 * Lê o quanto já se ouviu do `progressStore` aqui dentro, e não por prop, de
 * propósito: a Escuta 1 publica a cada conta nova, e assinar isso no shell faria a
 * sessão inteira re-renderizar durante a reprodução. Assinando aqui, só esta faixa
 * re-renderiza.
 *
 * A MARCA da meta de hoje (ENG-653) sai daqui pelo mesmo caminho: a meta se lê do
 * `goalStore` aqui dentro, e a barra recebe onde ela cai. Recalcular a cada render é
 * de propósito — o número de cenas e de perguntas cresce durante o trabalho, e a
 * marca de "2 cenas" tem de andar junto —, e é por isso que progresso e meta saem de
 * uma chamada só a `storyBarValues`: duas chamadas seriam duas varreduras da sessão
 * por render.
 *
 * Quem AVISA que a meta chegou é esta faixa, porque é aqui que os dois números se
 * encontram; quem decide o que fazer com o aviso é o shell, o único que sabe se há
 * outra tela cheia no ar.
 */
export function StoryProgress({
  session,
  onGoalReached,
}: {
  session: SessionState;
  /**
   * O progresso alcançou (ou deixou de alcançar) a meta de hoje. Recebe o estado,
   * não um evento, para que o shell possa passar um `setState` direto: identidade
   * estável sem `useCallback`, que é o que a memoização desta faixa precisa.
   */
  onGoalReached?: (reached: boolean) => void;
}) {
  const { t } = useTranslation();
  const heardBeads = useProgressStore((s) => s.heardBeads);
  const goal = useGoalStore((s) => s.goal);

  const stations = stepperStations(session);
  const stationIndex = stations.findIndex((s) => s.state === 'current');
  const current = stations[stationIndex];

  const { percent, goalAt } = storyBarValues({ session, stationIndex, heardBeads }, goal);

  // a mesma folga do protótipo: as duas pontas vêm de arredondamentos diferentes, e
  // exigir igualdade exata deixaria a meta por alcançar por um centésimo
  const reached = goalAt !== null && percent >= goalAt - 0.01;
  useEffect(() => {
    onGoalReached?.(reached);
  }, [reached, onGoalReached]);

  if (!current) return null;

  return (
    <section className="cds-story-progress" aria-label={t('shell.progressAria')}>
      <p className="cds-story-progress-name" role="status">
        {t(current.labelKey)}
      </p>
      <StoryProgressBar percent={percent} dividers={STAGE_BOUNDARIES} goal={goalAt} />
    </section>
  );
}
