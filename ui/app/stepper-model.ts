import { modeLocks, type SessionState } from '../../domain';

/**
 * Deriva os quatro estados das estações (redesign §5.1) a partir do modo e dos gates
 * puros do domínio (`modeLocks`). Três modos viram quatro estações porque Escuta tem
 * dois passos (Ouvir/Cortar). É indicador de progresso: `reachable` espelha os gates
 * (estação travada = inalcançável); `state` é concluída/atual/futura pela posição no
 * fluxo. `key` = diretório em ui/pages (a station-registry resolve por ele).
 *
 * O fio de contas, que desenhava isto, saiu na ENG-668; a derivação ficou porque o
 * shell continua perguntando duas coisas a ela: que estação montar e que nome a
 * faixa de progresso anuncia.
 *
 * O fluxo TERMINA nas Frases (ENG-689). Fechada a última cena produtiva o domínio
 * vai a `concluida` (ENG-691), que NÃO é estação: é o fim das Frases, e por isso
 * mapeia para o mesmo índice que `segmentacao`.
 */

/**
 * Concluída, atual ou futura. Morava na conta-etapa do fio de contas, que saiu na
 * ENG-668; a derivação continua, e o tipo veio com ela.
 */
export type StationState = 'current' | 'done' | 'future';

export interface StepperStationView {
  key: string;
  /** Chave i18n do rótulo (`ui/i18n` `stations.*`) — quem renderiza traduz. */
  labelKey: string;
  state: StationState;
  reachable: boolean;
}

const STATIONS: readonly { key: string; labelKey: string }[] = [
  { key: 'listen', labelKey: 'stations.listen' },
  { key: 'cut', labelKey: 'stations.cut' },
  { key: 'triage', labelKey: 'stations.triage' },
  { key: 'phrases', labelKey: 'stations.phrases' },
];

function currentIndex(state: SessionState): number {
  switch (state.mode) {
    case 'escuta':
      return state.whole.confirmed ? 1 : 0;
    case 'triagem':
      return 2;
    case 'segmentacao':
    case 'concluida':
      return 3;
  }
}

export function stepperStations(state: SessionState): StepperStationView[] {
  const locks = modeLocks(state);
  const reachable = [true, state.whole.confirmed, locks.triagem, locks.segmentacao];
  const ci = currentIndex(state);
  return STATIONS.map((def, i) => ({
    key: def.key,
    labelKey: def.labelKey,
    state: i === ci ? 'current' : i < ci ? 'done' : 'future',
    reachable: reachable[i]!,
  }));
}
