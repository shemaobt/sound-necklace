import type { Player } from '../../../adapters/audio';

/**
 * O colar é o transporte (PRD v2 §8.2): um toque numa conta toca a partir dela e
 * tocar a cabeça brilhante pausa/retoma.
 *
 * Cada toque de conta ganha uma chave nova — assim tocar outra conta (mesmo uma
 * atrás da cabeça) sempre reinicia dali em vez de pausar. `onHead` re-alterna a
 * última reprodução iniciada, o que a porta interpreta como pausa/retomada por a
 * chave coincidir.
 */
export interface TransportHandlers {
  onBead(bead: number): void;
  onHead(): void;
}

export function makeTransportHandlers(player: Player, totalBeads: number): TransportHandlers {
  const end = totalBeads - 1;
  let last: { key: string; s: number; e: number } | null = null;
  let taps = 0;

  const start = (key: string, s: number): void => {
    player.toggle(key, s, end);
    last = { key, s, e: end };
  };

  return {
    onBead(bead) {
      taps += 1;
      start(`conta:${taps}`, bead);
    },
    onHead() {
      if (last) player.toggle(last.key, last.s, last.e);
    },
  };
}
