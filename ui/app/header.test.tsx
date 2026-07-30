import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Header } from './header';
import headerCss from './header.css?raw';

function noop() {}

describe('Header — fixo durante o scroll das estações (ENG-315)', () => {
  it('a regra do header é sticky no topo (controles sempre à mão)', () => {
    const rule = /\.cds-header\s*{[^}]*}/.exec(headerCss)?.[0] ?? '';
    expect(rule).toContain('position: sticky');
    expect(rule).toContain('top: 0');
  });
});

describe('Header', () => {
  it('não tem título — a marca é só o ícone', () => {
    const { container } = render(
      <Header muted={false} onToggleMuted={() => {}} onBack={() => {}} onSettings={noop} />,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(container.querySelector('.cds-header-icon svg')).not.toBeNull();
  });

  it('o pill Histórias volta ao dashboard', () => {
    const onBack = vi.fn();
    render(<Header muted={false} onToggleMuted={() => {}} onBack={onBack} onSettings={noop} />);

    const back = screen.getByRole('button', { name: 'Voltar às histórias' });
    expect(back.textContent).toContain('Histórias');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('o toggle de som reflete o estado e alterna ao clicar', () => {
    const onToggleMuted = vi.fn();
    const { rerender } = render(
      <Header muted={false} onToggleMuted={onToggleMuted} onBack={() => {}} onSettings={noop} />,
    );

    const toggle = screen.getByRole('button', { name: 'Desligar o som da interface' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggleMuted).toHaveBeenCalledTimes(1);

    rerender(
      <Header muted={true} onToggleMuted={onToggleMuted} onBack={() => {}} onSettings={noop} />,
    );
    const pressed = screen.getByRole('button', { name: 'Ligar o som da interface' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Header — som e volume da sessão (ENG-314)', () => {
  it('com onVolume, o ícone abre o popover: mute dentro + reforço até 2×', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const onVolume = vi.fn();
    const onToggleMuted = vi.fn();
    render(
      <Header
        muted={false}
        onToggleMuted={onToggleMuted}
        onBack={() => {}}
        volume={1}
        onVolume={onVolume}
        onSettings={noop}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'som e volume' }));
    const slider = await screen.findByRole('slider', { name: 'volume da história' });
    expect(slider.getAttribute('max')).toBe('2');

    fireEvent.change(slider, { target: { value: '1.5' } });
    expect(onVolume).toHaveBeenCalledWith(1.5);

    await user.click(screen.getByRole('button', { name: 'Desligar o som da interface' }));
    expect(onToggleMuted).toHaveBeenCalled();
  });

  it('sem onVolume, o botão segue o toggle simples de sempre', () => {
    const onToggleMuted = vi.fn();
    render(
      <Header muted={false} onToggleMuted={onToggleMuted} onBack={() => {}} onSettings={noop} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Desligar o som da interface' }));
    expect(onToggleMuted).toHaveBeenCalled();
  });
});

/**
 * ENG-371: o idioma deixou de ser um clique do cabeçalho. Um botão PT/EN ao lado do som
 * convidava a alternar no meio de uma sessão — e o idioma governa a voz da entrevista e o
 * locale mandado ao STT. O cabeçalho agora leva a Configurações, onde a escolha mora.
 */
describe('Header — idioma saiu, Configurações entrou (ENG-371)', () => {
  it('não oferece mais o atalho de trocar idioma', () => {
    const { container } = render(
      <Header muted={false} onToggleMuted={() => {}} onBack={() => {}} onSettings={noop} />,
    );

    expect(container.querySelector('.cds-header-lang')).toBeNull();
    expect(screen.queryByRole('button', { name: /inglês|English/ })).toBeNull();
  });

  it('o botão de configurações chama onSettings', () => {
    const onSettings = vi.fn();
    render(
      <Header muted={false} onToggleMuted={() => {}} onBack={() => {}} onSettings={onSettings} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Configurações' }));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });
});
