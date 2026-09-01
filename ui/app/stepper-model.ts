import { modeLocks, type SessionState } from '../../domain';

/**
 * Deriva os seis estados das estações (redesign §5.1) a partir do modo e dos gates
 * puros do domínio (`modeLocks`). Quatro modos viram seis estações porque Escuta tem
 * dois passos (Ouvir/Cortar) e Guardar é a cauda. É indicador de progresso:
 * `reachable` espelha os gates (estação travada = inalcançável); `state` é
 * concluída/atual/futura pela posição no fluxo. `key` = diretório em ui/pages (a
 * station-registry resolve por ele).
 *
 * O fio de contas, que desenhava isto, saiu na ENG-668; a derivação ficou porque o
 * shell continua perguntando duas coisas a ela: que estação montar e que nome a
 * faixa de progresso anuncia.
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
  { key: 'conversation', labelKey: 'stations.conversation' },
  { key: 'export', labelKey: 'stations.save' },
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

export function stepperStations(
  state: SessionState,
  opts: { viewingExport?: boolean } = {},
): StepperStationView[] {
  const locks = modeLocks(state);
  const reachable = [
    true,
    state.whole.confirmed,
    locks.triagem,
    locks.segmentacao,
    locks.mapeamento,
    // Guardar (export) é a cauda: alcançável exatamente quando a Conversa está —
    // história confirmada e ≥1 frase travada numa cena produtiva (o mesmo gate de
    // conversation). O shell a torna a conta atual ao entrar nela (`viewingExport`),
    // pois o domínio não tem um modo `export`.
    locks.mapeamento,
  ];
  const ci = opts.viewingExport ? STATIONS.length - 1 : currentIndex(state);
  return STATIONS.map((def, i) => ({
    key: def.key,
    labelKey: def.labelKey,
    state: i === ci ? 'current' : i < ci ? 'done' : 'future',
    reachable: reachable[i]!,
  }));
}
