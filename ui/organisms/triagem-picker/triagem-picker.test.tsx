import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SCENE_KINDS } from '../../../domain';
import { splitByGuard } from '../../atoms/testing/css';
import { TriagemPicker } from './triagem-picker';
import pickerCss from './triagem-picker.css?raw';

/** Mapeamento de temas decidido no planejamento (issue ENG-225) — display-only. */
const EXPECTED_THEMES: Record<string, string[]> = {
  'indo-e-vindo': [
    'DEPARTURE_SCENE',
    'ARRIVAL_SCENE',
    'NIGHT_APPROACH_SCENE',
    'PROVISION_HOMECOMING_SCENE',
    'INITIATIVE_SCENE',
  ],
  'fala-e-acordo': [
    'APPEAL_SCENE',
    'INSTRUCTION_SCENE',
    'CONSENT_SCENE',
    'RATIFICATION_SCENE',
    'GATE_COURT_CONVENING_SCENE',
    'REDEMPTION_OFFER_SCENE',
    'REDEMPTION_DECLINE_SCENE',
    'REPORT_SCENE',
  ],
  'trabalho-e-terra': ['GLEANING_SCENE', 'MEAL_SCENE'],
  sentimento: ['LAMENT_SCENE', 'BEREAVEMENT_SCENE'],
  'rito-e-alianca': [
    'MARRIAGE_SCENE',
    'VOW_SCENE',
    'BIRTH_SCENE',
    'NAMING_SCENE',
    'BLESSING_SCENE',
    'REDEEMER_RECOGNITION_SCENE',
  ],
  narracao: [
    'NARRATOR_INTRODUCTION_SCENE',
    'NARRATOR_FRAMING_CLOSE_SCENE',
    'OPENING_CHRONICLE_SCENE',
    'GENEALOGY_SCENE',
  ],
};

/** Os valores EN dos cartões visíveis (o none-fit não tem title). */
function visibleKindValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[role="radio"][title]')).map(
    (el) => el.getAttribute('title') ?? '',
  );
}

function expand(container: HTMLElement) {
  const disclosure = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === 'Ver todos os tipos por tema',
  );
  expect(disclosure).toBeDefined();
  fireEvent.click(disclosure!);
}

describe('TriagemPicker — grade "Mais comuns" e disclosure por tema', () => {
  it('recolhido, mostra exatamente os 8 tipos do tier comum', () => {
    const { container } = render(<TriagemPicker />);
    const comuns = SCENE_KINDS.filter((k) => k.tier === 'comum').map((k) => k.value);
    expect(visibleKindValues(container).sort()).toEqual([...comuns].sort());
  });

  it('o disclosure expõe os 27 tipos agrupados nos 6 temas decididos', () => {
    const { container } = render(<TriagemPicker />);
    const disclosure = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Ver todos os tipos por tema',
    )!;
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(disclosure);

    const themeBlocks = Array.from(container.querySelectorAll('[data-theme]'));
    expect(themeBlocks.map((b) => b.getAttribute('data-theme'))).toEqual(
      Object.keys(EXPECTED_THEMES),
    );
    for (const block of themeBlocks) {
      const name = block.getAttribute('data-theme')!;
      const values = Array.from(block.querySelectorAll('[role="radio"][title]')).map(
        (el) => el.getAttribute('title') ?? '',
      );
      expect(values.sort()).toEqual([...EXPECTED_THEMES[name]!].sort());
    }
    const all = new Set(
      themeBlocks.flatMap((b) =>
        Array.from(b.querySelectorAll('[role="radio"][title]')).map(
          (el) => el.getAttribute('title') ?? '',
        ),
      ),
    );
    expect(all.size).toBe(27);
    expect([...all].sort()).toEqual(SCENE_KINDS.map((k) => k.value).sort());
  });

  it('o título de cada tema renderiza traduzido (a chave aninhada resolve de verdade)', () => {
    const { container } = render(<TriagemPicker />);
    expand(container);

    const titulos = Array.from(container.querySelectorAll('.cds-triagem-picker-theme-label')).map(
      (el) => el.textContent?.trim() ?? '',
    );

    // Sem esta asserção, uma chave que NÃO resolve renderiza o próprio caminho
    // ("triagemPicker.theme.indo-e-vindo") e a suíte seguiria verde.
    expect(titulos).toEqual([
      'Indo e vindo',
      'Fala e acordo',
      'Trabalho e terra',
      'Sentimento',
      'Rito e aliança',
      'Narração',
    ]);
  });

  it('"recolher" fecha a lista por tema de volta aos comuns', () => {
    const { container, getByRole } = render(<TriagemPicker />);
    expand(container);
    const recolher = getByRole('button', { name: 'recolher' });
    expect(recolher.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(recolher);
    expect(container.querySelector('[data-theme]')).toBeNull();
    expect(visibleKindValues(container)).toHaveLength(8);
  });

  it('o cartão "Nenhum se encaixa" permanece visível recolhido, expandido e filtrando', () => {
    const { container, getByText, getByLabelText } = render(<TriagemPicker />);
    expect(getByText('Nenhum se encaixa')).toBeTruthy();
    expand(container);
    expect(getByText('Nenhum se encaixa')).toBeTruthy();
    fireEvent.change(getByLabelText('filtrar tipos'), { target: { value: 'respiga' } });
    expect(getByText('Nenhum se encaixa')).toBeTruthy();
  });
});

describe('TriagemPicker — filtro (conveniência da facilitadora)', () => {
  it('estreita pelo rótulo PT-BR', () => {
    const { container, getByLabelText } = render(<TriagemPicker />);
    fireEvent.change(getByLabelText('filtrar tipos'), { target: { value: 'Respiga' } });
    expect(visibleKindValues(container)).toEqual(['GLEANING_SCENE']);
  });

  it('estreita pelo valor inglês', () => {
    const { container, getByLabelText } = render(<TriagemPicker />);
    fireEvent.change(getByLabelText('filtrar tipos'), { target: { value: 'GLEANING' } });
    expect(visibleKindValues(container)).toEqual(['GLEANING_SCENE']);
  });

  it('ignora acentos (bencao encontra Bênção)', () => {
    const { container, getByLabelText } = render(<TriagemPicker />);
    fireEvent.change(getByLabelText('filtrar tipos'), { target: { value: 'bencao' } });
    expect(visibleKindValues(container)).toEqual(['BLESSING_SCENE']);
  });

  it('limpar o filtro volta aos comuns', () => {
    const { container, getByLabelText } = render(<TriagemPicker />);
    const input = getByLabelText('filtrar tipos');
    fireEvent.change(input, { target: { value: 'voto' } });
    expect(visibleKindValues(container)).toEqual(['VOW_SCENE']);
    fireEvent.change(input, { target: { value: '' } });
    expect(visibleKindValues(container)).toHaveLength(8);
  });

  it('sem resultado algum, "Nenhum se encaixa" segue visível e clicável', () => {
    const onNoneFit = vi.fn();
    const { container, getByText, getByLabelText } = render(
      <TriagemPicker onNoneFit={onNoneFit} />,
    );
    fireEvent.change(getByLabelText('filtrar tipos'), { target: { value: 'xyz' } });
    expect(visibleKindValues(container)).toHaveLength(0);
    fireEvent.click(getByText('Nenhum se encaixa'));
    expect(onNoneFit).toHaveBeenCalledOnce();
  });

  it('digitar com temas expandidos troca para a grade filtrada (temas somem)', () => {
    const { container, getByLabelText } = render(<TriagemPicker />);
    expand(container);
    expect(container.querySelector('[data-theme]')).not.toBeNull();
    fireEvent.change(getByLabelText('filtrar tipos'), { target: { value: 'voto' } });
    expect(container.querySelector('[data-theme]')).toBeNull();
    expect(visibleKindValues(container)).toEqual(['VOW_SCENE']);
  });
});

describe('TriagemPicker — cartão mostra PT, inglês só no title (hover)', () => {
  it('o rótulo visível é PT-BR e o title carrega o valor inglês intocado', () => {
    const { container } = render(<TriagemPicker />);
    const card = container.querySelector('[role="radio"][title="BEREAVEMENT_SCENE"]')!;
    expect(card.textContent).toBe('Luto');
  });

  it('nenhum valor EN aparece como texto visível em estado algum', () => {
    const { container, getByLabelText } = render(<TriagemPicker />);
    expect(container.textContent).not.toMatch(/_SCENE/);
    expand(container);
    expect(container.textContent).not.toMatch(/_SCENE/);
    fireEvent.change(getByLabelText('filtrar tipos'), { target: { value: 'respiga' } });
    expect(container.textContent).not.toMatch(/_SCENE/);
    fireEvent.change(getByLabelText('filtrar tipos'), { target: { value: '' } });
    fireEvent.click(container.querySelector('[role="radio"][title="APPEAL_SCENE"]')!);
    expect(container.textContent).not.toMatch(/_SCENE/);
  });
});

describe('TriagemPicker — escolher tipo revela o passo de confiança', () => {
  it('escolher um tipo troca a grade pelo passo de confiança com o tipo escolhido', () => {
    const { container, getByText, queryByText } = render(<TriagemPicker />);
    fireEvent.click(container.querySelector('[role="radio"][title="BEREAVEMENT_SCENE"]')!);

    expect(queryByText('Mais comuns')).toBeNull();
    expect(getByText('Luto')).toBeTruthy();
    expect(getByText('O quanto isso parece certo pra você?')).toBeTruthy();
    expect(getByText('Certeza')).toBeTruthy();
    expect(getByText('Quase')).toBeTruthy();
    expect(getByText('Na dúvida')).toBeTruthy();
  });

  it('"trocar tipo" volta para a grade sem emitir nada e descarta a escolha', () => {
    const onConfirm = vi.fn();
    const { container, getByText, queryByText } = render(<TriagemPicker onConfirm={onConfirm} />);
    fireEvent.click(container.querySelector('[role="radio"][title="BEREAVEMENT_SCENE"]')!);
    fireEvent.click(getByText('Certeza'));
    fireEvent.click(getByText('trocar tipo'));

    expect(getByText('Mais comuns')).toBeTruthy();
    expect(queryByText('Certeza')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();

    // reescolher: a escolha anterior não vaza para o novo tipo
    fireEvent.click(container.querySelector('[role="radio"][title="APPEAL_SCENE"]')!);
    expect(queryByText('Confirmar')).toBeNull();
  });

  it('o foco entra no trio ao escolher e volta à grade no "trocar tipo" (WCAG 2.4.3)', () => {
    const { container, getByText } = render(<TriagemPicker />);
    const kindCard = container.querySelector<HTMLElement>('[role="radio"][title="APPEAL_SCENE"]')!;
    kindCard.focus();
    fireEvent.click(kindCard);
    const trioRadios = Array.from(container.querySelectorAll<HTMLElement>('[role="radio"]'));
    expect(trioRadios).toContain(document.activeElement);

    fireEvent.click(getByText('trocar tipo'));
    const gridTabbable = container.querySelector<HTMLElement>('[role="radio"][tabindex="0"]');
    expect(document.activeElement).toBe(gridTabbable);
  });
});

describe('TriagemPicker — confirmar emite os valores contratuais exatos', () => {
  it.each([
    ['Certeza', 'alta'],
    ['Quase', 'média'],
    ['Na dúvida', 'baixa'],
  ] as const)('%s + Confirmar emite "%s"', (label, stored) => {
    const onConfirm = vi.fn();
    const { container, getByText } = render(<TriagemPicker onConfirm={onConfirm} />);
    fireEvent.click(container.querySelector('[role="radio"][title="APPEAL_SCENE"]')!);
    fireEvent.click(getByText(label));
    expect(onConfirm).not.toHaveBeenCalled(); // escolher só seleciona
    fireEvent.click(getByText('Confirmar'));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('APPEAL_SCENE', stored);
  });

  it('escolher marca o rádio (aria-checked) e revela o Confirmar', () => {
    const { container, getByText, queryByText } = render(<TriagemPicker />);
    fireEvent.click(container.querySelector('[role="radio"][title="APPEAL_SCENE"]')!);
    expect(queryByText('Confirmar')).toBeNull(); // sem escolha, sem ação
    fireEvent.click(getByText('Certeza'));
    const checked = container.querySelector('[role="radio"][aria-checked="true"]')!;
    expect(checked.textContent).toContain('Certeza');
    expect(getByText('Confirmar')).toBeTruthy();
  });

  it('setas no trio movem e selecionam SEM confirmar (nunca cometem a triagem)', () => {
    const onConfirm = vi.fn();
    const { container, getByText } = render(<TriagemPicker onConfirm={onConfirm} />);
    fireEvent.click(container.querySelector('[role="radio"][title="APPEAL_SCENE"]')!);
    const certeza = getByText('Certeza').closest('[role="radio"]') as HTMLElement;
    certeza.focus();
    fireEvent.keyDown(certeza, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(getByText('Confirmar'));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('APPEAL_SCENE', 'baixa');
  });

  it('"média" carrega o U+00E9 (contrato)', () => {
    const onConfirm = vi.fn();
    const { container, getByText } = render(<TriagemPicker onConfirm={onConfirm} />);
    fireEvent.click(container.querySelector('[role="radio"][title="APPEAL_SCENE"]')!);
    fireEvent.click(getByText('Quase'));
    fireEvent.click(getByText('Confirmar'));
    const conf = onConfirm.mock.calls[0]?.[1] as string;
    expect(conf.codePointAt(1)).toBe(0xe9);
  });

  it('none-fit emite sem confiança e sem passar pelo trio', () => {
    const onConfirm = vi.fn();
    const onNoneFit = vi.fn();
    const { getByText } = render(<TriagemPicker onConfirm={onConfirm} onNoneFit={onNoneFit} />);
    fireEvent.click(getByText('Nenhum se encaixa'));
    expect(onNoneFit).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('TriagemPicker — teclado (radiogroup com roving tabindex)', () => {
  it('há exatamente um cartão tabbável e a seta move o foco sem selecionar', () => {
    const { container, queryByText } = render(<TriagemPicker />);
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

describe('TriagemPicker — movimento decorativo só sob reduced-motion (§9.3)', () => {
  it('animation/keyframes só dentro da guarda prefers-reduced-motion', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(pickerCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
