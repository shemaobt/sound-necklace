import { useTranslation } from 'react-i18next';

import { StepperStation } from '../molecules';
import type { StepperStationView } from './stepper-model';
import './stepper.css';

/**
 * O fio de contas (novos componentes.html, "Progresso geral · as etapas"): faixa de
 * 46px centrada com o NOME da etapa atual em cima e as seis contas-etapa (retângulos
 * telha) soltas, sem linha conectora.
 * Indicador de progresso, não navegação livre — uma estação só é clicável quando o
 * modo já foi legitimamente alcançado (`reachable`); clicar numa travada não faz
 * nada. O clique é delegado no `<ol>` e mapeado por posição, porque a conta em si
 * (a molécula StepperStation) é um `<li>` não-focável.
 */
export function Stepper({
  stations,
  onNavigate,
}: {
  stations: StepperStationView[];
  onNavigate: (key: string) => void;
}) {
  const { t } = useTranslation();
  const stateLabels = {
    current: t('stationState.current'),
    done: t('stationState.done'),
    future: t('stationState.future'),
  };
  const current = stations.find((s) => s.state === 'current');
  const handleClick = (event: React.MouseEvent<HTMLOListElement>) => {
    const li = (event.target as HTMLElement).closest('li');
    const list = li?.parentElement;
    if (!li || !list) return;
    const index = Array.prototype.indexOf.call(list.children, li);
    const station = stations[index];
    if (station?.reachable) onNavigate(station.key);
  };

  return (
    <div className="cds-stepper">
      {/* o <ol> abaixo já nomeia cada etapa para leitores de tela */}
      <p className="cds-stepper-name" aria-hidden="true">
        {current ? t(current.labelKey) : ''}
      </p>
      <ol className="cds-stepper-dots" aria-label={t('shell.stepperAria')} onClick={handleClick}>
        {stations.map((s) => (
          <StepperStation
            key={s.key}
            label={t(s.labelKey)}
            state={s.state}
            stateLabels={stateLabels}
          />
        ))}
      </ol>
    </div>
  );
}
