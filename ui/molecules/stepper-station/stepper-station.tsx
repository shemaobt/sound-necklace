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
  // 'lit' também na atual: o destaque do protótipo é tamanho (11 vs 7) + halo
  // (CSS colocalizado), não o anel de playhead do estado 'head'.
  current: 'lit',
  done: 'lit',
  future: 'unplayed',
};

/**
 * Uma conta-etapa do fio de contas (Protótipo.dc.html, steps): bolinha de 11px
 * (atual, com halo) ou 7px (feita = pérola telha; futura = oca), nome em sr-only —
 * o nome visível da etapa atual vive no organismo. É um indicador de progresso,
 * não navegação — um `<li>` (o organismo o embrulha num `<ol>` nomeado), com o
 * estado também em texto sr-only e `aria-current` no atual.
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
      <Pearl state={PEARL_STATE[state]} size={state === 'current' ? 11 : 7} />
      <span className="cds-stepper-station-state">{stateLabels[state]}</span>
      <span className="cds-stepper-station-label">{label}</span>
    </li>
  );
}
