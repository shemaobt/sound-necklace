import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SessionList, type SessionCardData } from './session-list';

const emProgresso: SessionCardData = {
  id: 'sess-1',
  storyName: 'A história de Rute',
  slug: 'historia-de-rute',
  project: 'Projeto Sul',
  status: 'in-progress',
  lastModified: 'hoje, 14h02',
  progress: 2 / 6,
  progressLabel: 'progresso: Cortar — passo 2 de 6',
};

const concluida: SessionCardData = {
  id: 'sess-2',
  storyName: 'O chamado do profeta',
  slug: 'chamado-do-profeta',
  project: 'Projeto Norte',
  status: 'completed',
  lastModified: 'ontem, 09h40',
  progress: 1,
  progressLabel: 'progresso: Guardar — passo 6 de 6',
};

function cardOf(storyName: string): HTMLElement {
  // o título também vive escondido dentro do botão (nome composto) — mirar o h3
  const card = screen.getByRole('heading', { name: storyName }).closest('li');
  if (!(card instanceof HTMLElement)) throw new Error(`card "${storyName}" não encontrado`);
  return card;
}

describe('SessionList — sem projeto exibível, o card não mostra o separador (ENG-307)', () => {
  it("project vazio: o subtítulo é só o slug, sem ' · '", () => {
    render(<SessionList sessions={[{ ...emProgresso, project: '' }]} />);
    const card = cardOf('A história de Rute');
    const slug = card.querySelector('.cds-session-card-slug');
    expect(slug?.textContent).toBe('historia-de-rute');
    expect(slug?.textContent).not.toContain('·');
  });
});

describe('SessionList (PRD §7.2 — dashboard de sessões)', () => {
  it('renderiza uma lista nomeada com um card por sessão e os campos da sessão', () => {
    render(<SessionList sessions={[emProgresso, concluida]} />);

    const lista = screen.getByRole('list', { name: 'histórias' });
    expect(lista.querySelectorAll(':scope > li')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'A história de Rute' })).toBeDefined();
    // §7.2 pede slug E projeto no card
    expect(screen.getByText(/historia-de-rute/)).toBeDefined();
    expect(screen.getByText(/Projeto Sul/)).toBeDefined();
    expect(screen.getByText(/hoje, 14h02/)).toBeDefined();
    expect(screen.getByRole('heading', { name: 'O chamado do profeta' })).toBeDefined();
  });

  it('trata os dois status de forma distinta: rótulo e ação primária próprios', () => {
    render(<SessionList sessions={[emProgresso, concluida]} />);

    const aberta = cardOf('A história de Rute');
    const fechada = cardOf('O chamado do profeta');

    expect(aberta.getAttribute('data-status')).toBe('in-progress');
    expect(fechada.getAttribute('data-status')).toBe('completed');
    expect(within(aberta).getByText('Em andamento')).toBeDefined();
    expect(within(fechada).getByText('Concluída')).toBeDefined();

    expect(within(aberta).getByRole('button', { name: /retomar/i })).toBeDefined();
    expect(within(aberta).queryByRole('button', { name: /abrir/i })).toBeNull();
    expect(within(fechada).getByRole('button', { name: /abrir/i })).toBeDefined();
    expect(within(fechada).queryByRole('button', { name: /retomar/i })).toBeNull();

    // o card não aninha listas (a capa do fio é uma imagem, não uma lista)
    expect(within(fechada).queryByRole('list')).toBeNull();
  });

  it('a ação primária é nomeada pela composição verbo + título da sessão', () => {
    render(<SessionList sessions={[emProgresso, concluida]} />);

    expect(screen.getByRole('button', { name: /retomar.*a história de rute/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /abrir.*o chamado do profeta/i })).toBeDefined();
  });

  it('retomar/abrir disparam onResume/onOpen com o id da sessão certa', () => {
    const onResume = vi.fn();
    const onOpen = vi.fn();
    render(<SessionList sessions={[emProgresso, concluida]} onResume={onResume} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: /retomar.*a história de rute/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledWith('sess-1');
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /abrir.*o chamado do profeta/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('sess-2');
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('a capa do fio é o relance de progresso: contas acesas na proporção, com nome acessível', () => {
    render(<SessionList sessions={[emProgresso, concluida]} />);

    // Quantas contas a miniatura tem é ENFEITE (muda sem mudar comportamento) — o que
    // importa é a PROPORÇÃO acesa e o passo anunciado no nome acessível.
    const lit = (el: Element): number => el.querySelectorAll('[data-state="lit"]').length;
    const total = (el: Element): number => el.querySelectorAll('.cds-pearl').length;

    const aberta = cardOf('A história de Rute');
    const capa = within(aberta).getByRole('img', { name: 'progresso: Cortar — passo 2 de 6' });
    expect(lit(capa) / total(capa)).toBeCloseTo(2 / 6, 1);

    // sessão concluída: o fio inteiro aceso
    const fechada = cardOf('O chamado do profeta');
    const capaFim = within(fechada).getByRole('img', { name: /passo 6 de 6/ });
    expect(lit(capaFim)).toBe(total(capaFim));
  });

  it('lista vazia renderiza sem cards e sem erro', () => {
    render(<SessionList sessions={[]} />);

    const lista = screen.getByRole('list', { name: 'histórias' });
    expect(lista.querySelectorAll(':scope > li')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('com onNew, a grade ABRE com o cartão "comece uma nova história"', () => {
    const onNew = vi.fn();
    render(<SessionList sessions={[emProgresso]} onNew={onNew} />);

    const lista = screen.getByRole('list', { name: 'histórias' });
    expect(lista.querySelectorAll(':scope > li')).toHaveLength(2);

    const botao = screen.getByRole('button', { name: /comece uma nova história/i });
    // "abre com": é o PRIMEIRO item da grade (o teste da lista vazia cobre a ausência
    // do cartão quando não há onNew — ele não renderiza botão nenhum).
    expect(lista.firstElementChild).toBe(botao.closest('li'));

    fireEvent.click(botao);
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('o card não aninha interativos: a única ação é o botão primário', () => {
    render(<SessionList sessions={[emProgresso]} />);

    const card = cardOf('A história de Rute');
    expect(within(card).getAllByRole('button')).toHaveLength(1);
    expect(within(card).queryAllByRole('link')).toHaveLength(0);
  });
});
