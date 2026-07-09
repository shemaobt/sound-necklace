import { modeLocks, type SessionState } from '../../domain';
import type { StationState } from '../molecules';

/**
 * Deriva os seis estados do fio de contas (redesign §5.1) a partir do modo e dos
 * gates puros do domínio (`modeLocks`). Quatro modos viram seis estações porque
 * Escuta tem dois passos (Ouvir/Cortar) e Guardar é a cauda. É indicador de
 * progresso: `reachable` espelha os gates (estação travada = inalcançável);
 * `state` é concluída/atual/futura pela posição no fluxo. `key` = diretório em
 * ui/pages (a station-registry resolve por ele).
 */

export interface StepperStationView {
  key: string;
  label: string;
  state: StationState;
  reachable: boolean;
}

const STATIONS: readonly { key: string; label: string }[] = [
  { key: 'escuta1', label: 'Ouvir' },
  { key: 'escuta2', label: 'Cortar' },
  { key: 'triagem', label: 'Triagem' },
  { key: 'segmentacao', label: 'Frases' },
  { key: 'mapeamento', label: 'Conversa' },
  { key: 'export', label: 'Guardar' },
];

function currentIndex(state: SessionState): number {
  switch (state.mode) {
    case 'escuta':
      return state.whole.confirmed ? 1 : 0;
    case 'triagem':
      return 2;
    case 'segmentacao':
      return 3;
    case 'mapeamento':
      return 4;
  }
}

export function stepperStations(state: SessionState): StepperStationView[] {
  const locks = modeLocks(state);
  const reachable = [
    true,
    state.whole.confirmed,
    locks.triagem,
    locks.segmentacao,
    locks.mapeamento,
    // Guardar (export) é a cauda: exibida como conta futura, mas ainda não
    // alcançável — a estação Export a liga na ENG-246 (evita afordância morta).
    false,
  ];
  const ci = currentIndex(state);
  return STATIONS.map((def, i) => ({
    key: def.key,
    label: def.label,
    state: i === ci ? 'current' : i < ci ? 'done' : 'future',
    reachable: reachable[i]!,
  }));
}
