import { CordLine, Pearl, type PearlState } from '../../atoms';
import type { PaletteEntry } from '../../tokens';
import './bead-row.css';

/** Uma conta da fileira; espelha as props apresentacionais da Pearl. */
export type BeadCell = {
  /** chave React estável (índice de conta no colar, tratado só como identidade) */
  key: string | number;
  state?: PearlState;
  /** cor do segmento (§4.2); sem tint = pérola-aveia */
  tint?: PaletteEntry;
  size?: number;
  sceneEnd?: boolean;
  ping?: boolean;
};

/**
 * Fileira de pérolas sobre o fio (redesign §4.3) — o segmento de linha que o
 * colar (organismo) empilha. Pura layout: recebe as contas já resolvidas por
 * props e não sabe nada de índices, janela ou domínio.
 */
export function BeadRow({ beads }: { beads: BeadCell[] }) {
  return (
    <div className="cds-bead-row">
      <CordLine />
      {beads.map(({ key, ...bead }) => (
        <Pearl key={key} {...bead} />
      ))}
    </div>
  );
}
