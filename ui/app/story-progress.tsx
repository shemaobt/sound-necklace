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
 */
export function StoryProgress({
  session,
  viewingExport = false,
  voice = NO_VOICE,
}: {
  session: SessionState;
  /** O shell está na cauda Guardar (estado local dele — ver stepper-model). */
  viewingExport?: boolean;
  /** Caminhos com resposta gravada (`meta.voice`). */
  voice?: readonly string[];
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
    voice,
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
