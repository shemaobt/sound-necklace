import { Pearl, type PearlState } from '../../atoms';
import './stepper-station.css';

export type StationState = 'current' | 'done' | 'future';

/** Default PT-BR: presentacional — quem chama passa o texto traduzido (ENG-279). */
const DEFAULT_STATE_TEXT: Record<StationState, string> = {
  current: 'etapa atual',
  done: 'concluído',
  future: 'não concluído',
};

const PEARL_STATE: Record<StationState, PearlState> = {
  current: 'head',
  done: 'lit',
  future: 'unplayed',
};

/**
 * Uma conta-etapa do fio de contas (redesign §5.1): pérola + nome curto. Atual =
 * pérola acesa com halo; concluída = pérola cheia; futura = pérola oca. É um
 * indicador de progresso, não navegação — um `<li>` (o organismo o embrulha num
 * `<ol>` nomeado), com o estado também em texto sr-only e `aria-current` no atual.
 */
export function StepperStation({
  label,
  state,
  stateLabels = DEFAULT_STATE_TEXT,
}: {
  label: string;
  state: StationState;
  /** Texto sr-only do estado; o organismo passa o traduzido (ENG-279). */
  stateLabels?: Record<StationState, string>;
}) {
  return (
    <li
      className="cds-stepper-station"
      data-state={state}
      aria-current={state === 'current' ? 'step' : undefined}
    >
      <Pearl state={PEARL_STATE[state]} size={state === 'current' ? 20 : 13} />
      <span className="cds-stepper-station-state">{stateLabels[state]}</span>
      <span className="cds-stepper-station-label">{label}</span>
    </li>
  );
}
