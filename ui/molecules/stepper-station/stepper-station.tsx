import './stepper-station.css';

export type StationState = 'current' | 'done' | 'future';

/** Default PT-BR: presentacional — quem chama passa o texto traduzido (ENG-279). */
const DEFAULT_STATE_TEXT: Record<StationState, string> = {
  current: 'etapa atual',
  done: 'concluído',
  future: 'não concluído',
};

/**
 * Uma conta-etapa do fio de contas (design "novos componentes", card "Progresso
 * geral · as etapas"): um retângulo arredondado de 7px de altura — telha cheia
 * quando feita/atual, oca quando futura; a atual é mais larga (30 vs 18) e ganha
 * o halo (colocalizado no CSS). O rótulo fica no DOM só para leitores de tela e
 * para os seletores de teste; o nome visível da etapa atual vive no organismo.
 * É um indicador de progresso, não navegação — um `<li>` (o organismo o embrulha
 * num `<ol>` nomeado), com o estado também em texto sr-only e `aria-current` no atual.
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
      <span className="cds-stepper-station-bar" aria-hidden="true" />
      <span className="cds-stepper-station-state">{stateLabels[state]}</span>
      <span className="cds-stepper-station-label">{label}</span>
    </li>
  );
}
