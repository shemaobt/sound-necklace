import { render } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useRefreshOnFocus } from './use-refresh-on-focus';

/**
 * A granularidade é decisão do PROJETO: quem está com a tela aberta precisa ver a
 * escolha de outra pessoa sem recarregar. O gatilho é voltar a olhar a aba.
 */
function Probe({ refresh, enabled }: { refresh: () => void; enabled?: boolean }) {
  useRefreshOnFocus(refresh, enabled);
  return null;
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useRefreshOnFocus', () => {
  it('não chama nada só por montar — quem monta já leu', () => {
    const refresh = vi.fn();
    render(<Probe refresh={refresh} />);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('recarrega quando a janela ganha foco', () => {
    const refresh = vi.fn();
    render(<Probe refresh={refresh} />);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('recarrega ao voltar de segundo plano, e ignora o ir para segundo plano', () => {
    const refresh = vi.fn();
    render(<Probe refresh={refresh} />);
    act(() => setVisibility('hidden'));
    expect(refresh).not.toHaveBeenCalled();
    act(() => setVisibility('visible'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('usa sempre a função mais nova, sem re-registrar listener', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe refresh={first} />);
    rerender(<Probe refresh={second} />);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('desligado, não recarrega', () => {
    const refresh = vi.fn();
    render(<Probe refresh={refresh} enabled={false} />);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('desmontar remove os listeners', () => {
    const refresh = vi.fn();
    const { unmount } = render(<Probe refresh={refresh} />);
    unmount();
    act(() => window.dispatchEvent(new Event('focus')));
    expect(refresh).not.toHaveBeenCalled();
  });
});
