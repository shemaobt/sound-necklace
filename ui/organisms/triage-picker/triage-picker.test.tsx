import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SCENE_KINDS } from '../../../domain';
import { splitByGuard } from '../../atoms/testing/css';
import { TriagePicker } from './triage-picker';
import pickerCss from './triage-picker.css?raw';

/** Os valores EN dos cartões visíveis (o none-fit não tem title). */
function visibleKindValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[role="radio"][title]')).map(
    (el) => el.getAttribute('title') ?? '',
  );
}

/**
 * ENG-390 — os 27 tipos de uma vez.
 *
 * Na primeira validação a grade abria em "Mais comuns" e o resto vivia atrás de
 * um disclosure discreto que ninguém achou: as pessoas classificavam a partir de
 * uma lista curta acreditando ser a lista inteira. E o agrupamento por tema
 * obrigava a adivinhar o balde antes de procurar o tipo — a taxonomia é nossa,
 * não delas. Some tudo: 27 cartões, uma grade só.
 */
describe('TriagePicker — os 27 tipos, todos à vista', () => {
  it('mostra os 27 tipos já na primeira renderização, sem nada para abrir', () => {
    const { container } = render(<TriagePicker />);

    expect(visibleKindValues(container).sort()).toEqual(SCENE_KINDS.map((k) => k.value).sort());
  });

  it('não há disclosure nem seção "Mais comuns" para descobrir', () => {
    const { container, queryByText } = render(<TriagePicker />);

    expect(queryByText('Ver todos os tipos por tema')).toBeNull();
    expect(queryByText('recolher')).toBeNull();
    expect(queryByText('Mais comuns')).toBeNull();
    expect(container.querySelector('[aria-expanded]')).toBeNull();
  });

  it('os tipos vêm em ordem alfabética do rótulo PT-BR — a busca é pelo nome, não pelo balde', () => {
    const { container } = render(<TriagePicker />);

    const rotulos = Array.from(container.querySelectorAll('[role="radio"][title]')).map(
      (el) => el.textContent?.trim() ?? '',
    );

    expect(rotulos).toEqual([...rotulos].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });

  it('"Nenhum se encaixa" continua presente e fora da área que rola', () => {
    const { container, getByText } = render(<TriagePicker />);

    const noneFit = getByText('Nenhum se encaixa');
    const rolagem = container.querySelector('.cds-triage-picker-scroll');

    expect(rolagem).not.toBeNull();
    expect(rolagem!.contains(noneFit)).toBe(false);
  });

  it('a grade rola dentro da própria área, não empurrando a página', () => {
    const { container } = render(<TriagePicker />);

    const rolagem = container.querySelector('.cds-triage-picker-scroll');

    expect(rolagem!.querySelectorAll('[role="radio"][title]')).toHaveLength(27);
  });

  it('não há campo de busca — a classificação é operada só pela grade', () => {
    const { container, queryByRole } = render(<TriagePicker />);
    expect(container.querySelector('input')).toBeNull();
    expect(queryByRole('searchbox')).toBeNull();
  });
});

describe('TriagePicker — cartão mostra PT, inglês só no title (hover)', () => {
  it('o rótulo visível é PT-BR e o title carrega o valor inglês intocado', () => {
    const { container } = render(<TriagePicker />);
    const card = container.querySelector('[role="radio"][title="BEREAVEMENT_SCENE"]')!;
    expect(card.textContent).toBe('Luto');
  });

  it('nenhum valor EN aparece como texto visível em estado algum', () => {
    const { container } = render(<TriagePicker />);
    expect(container.textContent).not.toMatch(/_SCENE/);
    fireEvent.click(container.querySelector('[role="radio"][title="APPEAL_SCENE"]')!);
    expect(container.textContent).not.toMatch(/_SCENE/);
  });
});

describe('TriagePicker — escolher tipo revela o passo de confiança', () => {
  it('escolher um tipo troca a grade pelo passo de confiança com o tipo escolhido', () => {
    const { container, getByText } = render(<TriagePicker />);
    fireEvent.click(container.querySelector('[role="radio"][title="BEREAVEMENT_SCENE"]')!);

    expect(container.querySelector('.cds-triage-picker-scroll')).toBeNull();
    expect(getByText('Luto')).toBeTruthy();
    expect(getByText('O quanto isso parece certo pra você?')).toBeTruthy();
    expect(getByText('Certeza')).toBeTruthy();
    expect(getByText('Quase')).toBeTruthy();
    expect(getByText('Na dúvida')).toBeTruthy();
  });

  it('"Trocar tipo" volta para a grade sem emitir nada e descarta a escolha', () => {
    const onConfirm = vi.fn();
    const { container, getByText, queryByText } = render(<TriagePicker onConfirm={onConfirm} />);
    fireEvent.click(container.querySelector('[role="radio"][title="BEREAVEMENT_SCENE"]')!);
    fireEvent.click(getByText('Certeza'));
    fireEvent.click(getByText('Trocar tipo'));

    expect(container.querySelectorAll('[role="radio"][title]')).toHaveLength(SCENE_KINDS.length);
    expect(queryByText('Certeza')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();

    // reescolher: a escolha anterior não vaza para o novo tipo
    fireEvent.click(container.querySelector('[role="radio"][title="APPEAL_SCENE"]')!);
    expect(queryByText('Confirmar')).toBeNull();
  });

  it('o foco entra no trio ao escolher e volta à grade no "Trocar tipo" (WCAG 2.4.3)', () => {
    const { container, getByText } = render(<TriagePicker />);
    const kindCard = container.querySelector<HTMLElement>('[role="radio"][title="APPEAL_SCENE"]')!;
    kindCard.focus();
    fireEvent.click(kindCard);
    const trioRadios = Array.from(container.querySelectorAll<HTMLElement>('[role="radio"]'));
    expect(trioRadios).toContain(document.activeElement);

    fireEvent.click(getByText('Trocar tipo'));
    const gridTabbable = container.querySelector<HTMLElement>('[role="radio"][tabindex="0"]');
    expect(document.activeElement).toBe(gridTabbable);
  });
});

describe('TriagePicker — confirmar emite os valores contratuais exatos', () => {
  it.each([
    ['Certeza', 'high'],
    ['Quase', 'medium'],
    ['Na dúvida', 'low'],
  ] as const)('%s + Confirmar emite "%s"', (label, stored) => {
    const onConfirm = vi.fn();
    const { container, getByText } = render(<TriagePicker onConfirm={onConfirm} />);
    fireEvent.click(container.querySelector('[role="radio"][title="APPEAL_SCENE"]')!);
    fireEvent.click(getByText(label));
    expect(onConfirm).not.toHaveBeenCalled(); // escolher só seleciona
    fireEvent.click(getByText('Confirmar'));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('APPEAL_SCENE', stored);
  });

  it('escolher marca o rádio (aria-checked) e revela o Confirmar', () => {
    const { container, getByText, queryByText } = render(<TriagePicker />);
    fireEvent.click(container.querySelector('[role="radio"][title="APPEAL_SCENE"]')!);
    expect(queryByText('Confirmar')).toBeNull(); // sem escolha, sem ação
    fireEvent.click(getByText('Certeza'));
    const checked = container.querySelector('[role="radio"][aria-checked="true"]')!;
    expect(checked.textContent).toContain('Certeza');
    expect(getByText('Confirmar')).toBeTruthy();
  });

  it('setas no trio movem e selecionam SEM confirmar (nunca cometem a triage)', () => {
    const onConfirm = vi.fn();
    const { container, getByText } = render(<TriagePicker onConfirm={onConfirm} />);
    fireEvent.click(container.querySelector('[role="radio"][title="APPEAL_SCENE"]')!);
    const certeza = getByText('Certeza').closest('[role="radio"]') as HTMLElement;
    certeza.focus();
    fireEvent.keyDown(certeza, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(getByText('Confirmar'));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('APPEAL_SCENE', 'low');
  });

  it('none-fit emite sem confiança e sem passar pelo trio', () => {
    const onConfirm = vi.fn();
    const onNoneFit = vi.fn();
    const { getByText } = render(<TriagePicker onConfirm={onConfirm} onNoneFit={onNoneFit} />);
    fireEvent.click(getByText('Nenhum se encaixa'));
    expect(onNoneFit).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('TriagePicker — teclado (radiogroup com roving tabindex)', () => {
  it('há exatamente um cartão tabbável e a seta move o foco sem selecionar', () => {
    const { container, queryByText } = render(<TriagePicker />);
    const radios = Array.from(container.querySelectorAll<HTMLElement>('[role="radio"]'));
    const tabbable = radios.filter((r) => r.tabIndex === 0);
    expect(tabbable).toHaveLength(1);

    tabbable[0]!.focus();
    fireEvent.keyDown(tabbable[0]!, { key: 'ArrowRight' });

    const idx = radios.indexOf(tabbable[0]!);
    const next = radios[idx + 1]!;
    expect(document.activeElement).toBe(next);
    expect(next.tabIndex).toBe(0);
    expect(tabbable[0]!.tabIndex).toBe(-1);
    // mover o foco NÃO seleciona: a grade continua na tela
    expect(queryByText('O quanto isso parece certo pra você?')).toBeNull();
  });
});

describe('TriagePicker — movimento decorativo só sob reduced-motion (§9.3)', () => {
  it('animation/keyframes só dentro da guarda prefers-reduced-motion', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(pickerCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
