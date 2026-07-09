import { Pearl } from '../../atoms';
import type { PaletteEntry } from '../../tokens';
import './selection-band.css';

/** Um trecho do intervalo dentro de uma linha do colar. */
export type SelectionBandRow = {
  key: string | number;
  /** quantas contas do intervalo caem nesta linha */
  beadCount: number;
};

/**
 * Banda suave de seleção sob um intervalo pendente (redesign §4.3): as duas
 * contas de borda (primeira e última do intervalo inteiro) são enfatizadas com
 * o anel telha — "toque aqui para ouvir a costura" fica legível sem instrução
 * (§9.3). Quando o intervalo quebra em várias linhas, cada linha ganha o seu
 * segmento de banda. Pura apresentação: a geometria (quantas contas por linha)
 * é calculada acima, pelo colar (organismo).
 */
export function SelectionBand({ rows, tint }: { rows: SelectionBandRow[]; tint: PaletteEntry }) {
  const total = rows.reduce((n, row) => n + row.beadCount, 0);
  // offset da primeira conta de cada linha no intervalo (prefixo puro, sem mutação)
  const starts = rows.map((_, i) => rows.slice(0, i).reduce((n, r) => n + r.beadCount, 0));
  return (
    <div className="cds-selection-band">
      {rows.map((row, rowIndex) => {
        const from = starts[rowIndex] ?? 0;
        return (
          <div className="cds-selection-band-row" key={row.key}>
            <span className="cds-selection-band-fill" aria-hidden="true" />
            {Array.from({ length: row.beadCount }, (_, i) => {
              const globalIndex = from + i;
              const edge = globalIndex === 0 || globalIndex === total - 1;
              return (
                <span
                  className="cds-selection-band-bead"
                  key={globalIndex}
                  data-edge={edge || undefined}
                >
                  <Pearl tint={tint} state="lit" />
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
