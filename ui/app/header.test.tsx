import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Header } from './header';
import headerCss from './header.css?raw';

describe('Header — fixo durante o scroll das estações (ENG-315)', () => {
  it('a regra do header é sticky no topo (controles sempre à mão)', () => {
    const rule = /\.cds-header\s*{[^}]*}/.exec(headerCss)?.[0] ?? '';
    expect(rule).toContain('position: sticky');
    expect(rule).toContain('top: 0');
  });
});

describe('Header — a marca é a do site', () => {
  it('o ícone do cabeçalho é o Colar de Sons, não mais o Shemá', () => {
    render(<Header muted={false} onToggleMuted={() => {}} onBack={() => {}} />);

    expect(screen.getByRole('img', { name: 'Colar de Sons' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Shemá' })).toBeNull();
  });
});

describe('Header', () => {
  it('não tem título — a marca é só o ícone', () => {
    const { container } = render(
      <Header muted={false} onToggleMuted={() => {}} onBack={() => {}} />,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(container.querySelector('.cds-header-icon svg')).not.toBeNull();
  });

  it('o pill Histórias volta ao dashboard', () => {
    const onBack = vi.fn();
    render(<Header muted={false} onToggleMuted={() => {}} onBack={onBack} />);

    const back = screen.getByRole('button', { name: 'Voltar às histórias' });
    expect(back.textContent).toContain('Histórias');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('o toggle de som reflete o estado e alterna ao clicar', () => {
    const onToggleMuted = vi.fn();
    const { rerender } = render(
      <Header muted={false} onToggleMuted={onToggleMuted} onBack={() => {}} />,
    );

    const toggle = screen.getByRole('button', { name: 'Desligar o som da interface' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggleMuted).toHaveBeenCalledTimes(1);

    rerender(<Header muted={true} onToggleMuted={onToggleMuted} onBack={() => {}} />);
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
    render(<Header muted={false} onToggleMuted={onToggleMuted} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Desligar o som da interface' }));
    expect(onToggleMuted).toHaveBeenCalled();
  });
});

/**
 * ENG-391: o tema é um clique do cabeçalho — ao contrário do idioma, não governa
 * nada do conteúdo (nem a voz, nem o locale do STT), só o quanto a tela queima os
 * olhos. Trocar no meio de uma sessão é legítimo e não custa nada.
 */
describe('Header — tema claro/escuro (ENG-391)', () => {
  it('mostra a lua no claro e o sol no escuro, e o rótulo diz para onde vai', () => {
    const onToggleTheme = vi.fn();
    const { rerender, container } = render(
      <Header
        muted={false}
        onToggleMuted={() => {}}
        onBack={() => {}}
        theme="light"
        onToggleTheme={onToggleTheme}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mudar para o tema escuro' }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.cds-header-theme .cds-ico-moon')).not.toBeNull();

    rerender(
      <Header
        muted={false}
        onToggleMuted={() => {}}
        onBack={() => {}}
        theme="dark"
        onToggleTheme={onToggleTheme}
      />,
    );

    expect(screen.getByRole('button', { name: 'Mudar para o tema claro' })).not.toBeNull();
    expect(container.querySelector('.cds-header-theme .cds-ico-sun')).not.toBeNull();
  });

  it('sem quem trate a troca, não há botão — nenhum controle que não faz nada', () => {
    render(<Header muted={false} onToggleMuted={() => {}} onBack={() => {}} />);

    expect(screen.queryByRole('button', { name: /tema/ })).toBeNull();
  });
});

/**
 * ENG-371: o idioma deixou de ser um clique do cabeçalho. Um botão PT/EN ao lado do som
 * convidava a alternar no meio de uma sessão — e o idioma governa a voz da entrevista e o
 * locale mandado ao STT. O cabeçalho agora leva a Configurações, onde a escolha mora.
 */
describe('Header — nem idioma nem Configurações (ENG-371/ENG-375)', () => {
  it('não oferece atalho para trocar idioma', () => {
    const { container } = render(
      <Header muted={false} onToggleMuted={() => {}} onBack={() => {}} />,
    );

    expect(container.querySelector('.cds-header-lang')).toBeNull();
    expect(screen.queryByRole('button', { name: /inglês|English/ })).toBeNull();
  });

  /**
   * ENG-375: o cabeçalho está montado em TODA estação, então uma entrada para
   * Configurações aqui seria alcançável no meio da sessão — desfazendo o atrito que a
   * ENG-371 existia para criar. O caminho para lá é a casa.
   */
  it('não leva às Configurações a partir de uma estação', () => {
    const { container } = render(
      <Header muted={false} onToggleMuted={() => {}} onBack={() => {}} />,
    );

    expect(container.querySelector('.cds-header-settings')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Configurações' })).toBeNull();
  });
});

/**
 * ENG-393 — o "← Histórias" também espera a gravação.
 *
 * É a única saída da estação que não vive dentro do palco da conversa: travar os
 * botões de lá e deixar este vivo deixaria a pessoa sair da sessão no meio de uma
 * resposta, que é justamente a perda que a issue existe para impedir.
 *
 * A recusa devolve som, não texto — quem opera essa tela decide de ouvido —, e
 * por isso o clique recusado precisa CHEGAR ao handler. É o mesmo motivo pelo
 * qual o palco recusou `inert`: subárvore inerte não despacha clique nenhum.
 */
describe('Header — voltar durante a gravação (ENG-393)', () => {
  it('gravando, voltar não navega — avisa quem sabe fazer barulho', async () => {
    const onBack = vi.fn();
    const onBackBlocked = vi.fn();
    render(
      <Header
        muted={false}
        onToggleMuted={() => {}}
        onBack={onBack}
        backDisabled
        onBackBlocked={onBackBlocked}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Voltar às histórias' }));

    expect(onBack).not.toHaveBeenCalled();
    expect(onBackBlocked).toHaveBeenCalledTimes(1);
  });

  it('gravando, o botão se anuncia indisponível', () => {
    render(<Header muted={false} onToggleMuted={() => {}} onBack={() => {}} backDisabled />);

    expect(
      screen.getByRole('button', { name: 'Voltar às histórias' }).getAttribute('aria-disabled'),
    ).toBe('true');
  });
});
