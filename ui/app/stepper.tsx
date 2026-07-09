import { StepperStation } from '../molecules';
import type { StepperStationView } from './stepper-model';
import './stepper.css';

/**
 * O fio de contas (redesign §5.1): uma fita fina abaixo do cabeçalho com as seis
 * estações. Indicador de progresso, não navegação livre — uma estação só é
 * clicável quando o modo já foi legitimamente alcançado (`reachable`); clicar
 * numa travada não faz nada. O clique é delegado no `<ol>` e mapeado por posição,
 * porque a conta em si (a molécula StepperStation) é um `<li>` não-focável.
 */
export function Stepper({
  stations,
  onNavigate,
}: {
  stations: StepperStationView[];
  onNavigate: (key: string) => void;
}) {
  const handleClick = (event: React.MouseEvent<HTMLOListElement>) => {
    const li = (event.target as HTMLElement).closest('li');
    const list = li?.parentElement;
    if (!li || !list) return;
    const index = Array.prototype.indexOf.call(list.children, li);
    const station = stations[index];
    if (station?.reachable) onNavigate(station.key);
  };

  return (
    <ol className="cds-stepper" aria-label="Progresso da sessão" onClick={handleClick}>
      {stations.map((s) => (
        <StepperStation key={s.key} label={s.label} state={s.state} />
      ))}
    </ol>
  );
}
