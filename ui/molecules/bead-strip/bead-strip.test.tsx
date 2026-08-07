import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../atoms';
import { BeadStrip } from './bead-strip';

const telha = { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' };
const verde = { base: '#4E7A6A', lit: '#7BA595', deep: '#3A5C4F' };

/**
 * ENG-388 — a lista de cenas/frases vira um mini-colar.
 *
 * No rodapé da tela de corte, a lista era uma fileira de pílulas: com muitas
 * cenas virava poluição, cada item gritava as suas ações ao mesmo tempo, e o
 * botão de navegação da etapa era espremido para fora.
 *
 * Agora é uma conta por item, e as ações de UM item aparecem numa cápsula só,
 * quando aquele item é tocado. O conjunto de ações NÃO muda: continua sendo o
 * que a ENG-291 (som só pelas contas do colar) e a ENG-342 (reabrir virou
 * arrastar a alça de fim) deixaram. A entrega de design mostra tocar/marcar/
 * reabrir na cápsula — é conteúdo de demonstração, e implementá-lo reverteria
 * duas decisões do dono em silêncio.
 */

function items() {
  return [
    { key: 'a', label: 'Cena um', swatch: telha },
    { key: 'b', label: 'Cena duas', swatch: verde },
    { key: 'c', label: 'Cena três', swatch: telha },
  ];
}

describe('o fio de contas do rodapé', () => {
  it('rende uma conta por item', () => {
    render(<BeadStrip items={items()} selected={null} groupLabel="cenas costuradas" />);

    expect(
      within(screen.getByRole('group', { name: 'cenas costuradas' })).getAllByRole('button'),
    ).toHaveLength(3);
  });

  it('a conta não carrega número — quem numera é a cápsula, e por extenso', () => {
    const { container } = render(
      <BeadStrip items={items()} selected={null} groupLabel="cenas costuradas" />,
    );

    expect(container.textContent ?? '').not.toMatch(/\d/);
  });

  it('cada conta é anunciada pelo seu item', () => {
    render(<BeadStrip items={items()} selected={null} groupLabel="cenas costuradas" />);

    expect(screen.getByRole('button', { name: 'Cena duas' })).toBeTruthy();
  });

  it('tocar uma conta avisa quem manda — a seleção é do chamador', async () => {
    const onSelect = vi.fn();
    render(
      <BeadStrip
        items={items()}
        selected={null}
        onSelect={onSelect}
        groupLabel="cenas costuradas"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cena três' }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('c');
  });
});

describe('a cápsula do item selecionado', () => {
  it('sem seleção, nenhuma cápsula está aberta', () => {
    const { container } = render(
      <BeadStrip items={items()} selected={null} groupLabel="cenas costuradas" />,
    );

    expect(container.querySelector('.cds-bead-strip-capsule')).toBeNull();
  });

  it('há no máximo uma cápsula, e ela nomeia o item selecionado', () => {
    const { container } = render(
      <BeadStrip items={items()} selected="b" groupLabel="cenas costuradas" />,
    );

    const capsulas = container.querySelectorAll('.cds-bead-strip-capsule');
    expect(capsulas).toHaveLength(1);
    expect(capsulas[0]!.textContent).toContain('Cena duas');
  });

  it('só as ações do item selecionado aparecem — não as dos outros', async () => {
    const remover = vi.fn();
    const naoDeveAparecer = vi.fn();
    const lista = [
      {
        key: 'a',
        label: 'Cena um',
        swatch: telha,
        actions: <Button onClick={naoDeveAparecer}>remover</Button>,
      },
      {
        key: 'b',
        label: 'Cena duas',
        swatch: verde,
        actions: <Button onClick={remover}>remover</Button>,
      },
    ];
    render(<BeadStrip items={lista} selected="b" groupLabel="cenas costuradas" />);

    const acoes = screen.getAllByRole('button', { name: 'remover' });
    expect(acoes).toHaveLength(1);

    await userEvent.click(acoes[0]!);
    expect(remover).toHaveBeenCalledTimes(1);
    expect(naoDeveAparecer).not.toHaveBeenCalled();
  });

  it('a conta selecionada se anuncia como tal', () => {
    render(<BeadStrip items={items()} selected="b" groupLabel="cenas costuradas" />);

    expect(screen.getByRole('button', { name: 'Cena duas' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Cena um' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});

describe('a seleção não pode sobreviver ao item que ela aponta', () => {
  it('seleção apontando para um item que não existe mais não abre cápsula nenhuma', () => {
    /* O item removido some da lista antes de o chamador zerar a seleção — se a
       cápsula tentasse desenhá-lo assim mesmo, ofereceria ações sobre uma cena
       que já não existe. */
    const { container } = render(
      <BeadStrip items={items()} selected="removida" groupLabel="cenas costuradas" />,
    );

    expect(container.querySelector('.cds-bead-strip-capsule')).toBeNull();
  });

  it('lista vazia rende o estado vazio que o chamador passar, sem cápsula', () => {
    const { container } = render(
      <BeadStrip
        items={[]}
        selected={null}
        groupLabel="cenas costuradas"
        empty={<span>ainda não há cenas</span>}
      />,
    );

    expect(screen.getByText('ainda não há cenas')).toBeTruthy();
    expect(container.querySelector('.cds-bead-strip-capsule')).toBeNull();
  });
});
