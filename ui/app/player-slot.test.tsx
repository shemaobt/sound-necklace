import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlayerHost, PlayerSlotProvider } from './player-slot';

function Harness({ activeKey, stop }: { activeKey: string; stop: () => void }) {
  return (
    <PlayerSlotProvider
      activeKey={activeKey}
      player={{ stop }}
      playerNode={<div className="cds-player" data-testid="player" />}
    >
      <div>
        <PlayerHost slotKey="a" />
        <PlayerHost slotKey="b" />
      </div>
    </PlayerSlotProvider>
  );
}

describe('player itinerante (PRD §8.0 / redesign §5.2)', () => {
  it('mantém uma só instância, realoca ao host ativo e para o playback na troca', () => {
    const stop = vi.fn();
    const { rerender } = render(<Harness activeKey="a" stop={stop} />);

    expect(document.querySelectorAll('.cds-player')).toHaveLength(1);
    const hostA = document.querySelector('[data-player-host="a"]')!;
    expect(hostA.contains(document.querySelector('.cds-player'))).toBe(true);
    expect(stop).not.toHaveBeenCalled();

    rerender(<Harness activeKey="b" stop={stop} />);

    expect(document.querySelectorAll('.cds-player')).toHaveLength(1);
    const hostB = document.querySelector('[data-player-host="b"]')!;
    expect(hostB.contains(document.querySelector('.cds-player'))).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
