import { useTranslation } from 'react-i18next';

import type { SessionState } from '../../domain';
import { StoryProgressBar } from '../molecules';
import { useProgressStore } from '../state';
import { stepperStations } from './stepper-model';
import { STAGE_BOUNDARIES, storyProgressPercent } from './story-progress-model';
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
}: {
  session: SessionState;
  /** O shell está na cauda Guardar (estado local dele — ver stepper-model). */
  viewingExport?: boolean;
  /** Getter dos caminhos com resposta gravada (`meta.voice`) — ver acima. */
  voicePaths?: () => readonly string[];
}) {
  const { t } = useTranslation();
  const heardBeads = useProgressStore((s) => s.heardBeads);
  const artifactsDownloaded = useProgressStore((s) => s.artifactsDownloaded);

  const stations = stepperStations(session, { viewingExport });
  const stationIndex = stations.findIndex((s) => s.state === 'current');
  const current = stations[stationIndex];

  if (!current) return null;

  const percent = storyProgressPercent({
    session,
    stationIndex,
    heardBeads,
    artifactsDownloaded,
    voice: voicePaths(),
  });

  return (
    <div className="cds-story-progress">
      <p className="cds-story-progress-name" aria-hidden="true">
        {t(current.labelKey)}
      </p>
      <StoryProgressBar percent={percent} dividers={STAGE_BOUNDARIES} />
    </div>
  );
}

const NO_VOICE: readonly string[] = [];
/** Identidade estável: um `() => []` novo a cada render furaria a memoização. */
const noVoice = (): readonly string[] => NO_VOICE;
