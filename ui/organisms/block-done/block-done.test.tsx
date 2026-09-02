import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { parseRules, splitByGuard } from '../../atoms/testing/css';
import { scenePalette } from '../../tokens';
import { BlockDone, type BlockDoneProps } from './block-done';
import blockDoneCss from './block-done.css?raw';
import addonsCss from '../../app/addons-layer.css?raw';
import headerCss from '../../app/header.css?raw';

/**
 * A tela de fim de bloco (ENG-651; protótipo v4 "FIM DE BLOCO", linhas 842-855).
 * Nos dois limites estruturais do fluxo ela marca que um bloco fechou, antes do
 * próximo começar — e no fim da Rever (ENG-725) marca a história concluída. Tela de quem ouve (§9.2): nenhum dígito, nenhum id, uma ação
 * dominante. Os testes afirmam a cópia congelada da issue e o comportamento dos
 * dois botões — nunca chamadas internas.
 */

const TRIAGEM = {
  headline: 'As cenas todas têm nome.',
  subtitle: 'Agora vem a parte de dentro: as frases de cada cena.',
  primary: 'Seguir para as frases',
};
/** O fim do fluxo (ENG-725): a história concluída, vista da Rever. */
const HISTORIA = {
  eyebrow: 'A história inteira',
  headline: 'A história está completa.',
  subtitle:
    'Os cortes ficam guardados aqui, prontos para o próximo passo. Ninguém precisa fazer mais nada hoje.',
  primary: 'Voltar às histórias',
  secondary: 'Olhar de novo',
};
const REST = 'Guardar e descansar';

function props(over: Partial<BlockDoneProps> = {}): BlockDoneProps {
  return {
    block: 'triagem',
    tints: scenePalette.slice(0, 3),
    onContinue: vi.fn(),
    onRest: vi.fn(),
    ...over,
  };
}

describe('BlockDone — o que a tela diz em cada limite (ENG-651)', () => {
  it('sem bloco fechado não há tela nenhuma', () => {
    render(<BlockDone {...props({ block: null })} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a Triagem fechada anuncia a Triagem e continua para as frases', () => {
    render(<BlockDone {...props({ block: 'triagem' })} />);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Um bloco fechado')).toBeDefined();
    expect(screen.getByRole('heading', { name: TRIAGEM.headline })).toBeDefined();
    expect(screen.getByText(TRIAGEM.subtitle)).toBeDefined();
    expect(screen.getByRole('button', { name: TRIAGEM.primary })).toBeDefined();
    expect(screen.getByRole('button', { name: REST })).toBeDefined();
  });

  /**
   * ENG-725 — o limite que FECHA o fluxo tem cópia e secundária PRÓPRIAS: o
   * eyebrow nomeia a história inteira, e a segunda ação não guarda nada — devolve
   * à Rever. A Triagem mantém palavra por palavra o que tinha.
   */
  it('a história concluída anuncia a história inteira e oferece olhar de novo', () => {
    render(<BlockDone {...props({ block: 'historia', tints: scenePalette.slice(0, 5) })} />);

    expect(screen.getByText(HISTORIA.eyebrow)).toBeDefined();
    expect(screen.queryByText('Um bloco fechado')).toBeNull();
    expect(screen.getByRole('heading', { name: HISTORIA.headline })).toBeDefined();
    expect(screen.getByText(HISTORIA.subtitle)).toBeDefined();
    expect(screen.getByRole('button', { name: HISTORIA.primary })).toBeDefined();
    expect(screen.getByRole('button', { name: HISTORIA.secondary })).toBeDefined();
    expect(screen.queryByRole('button', { name: REST })).toBeNull();
  });

  it('olhar de novo avisa quem descansa — é a segunda ação do bloco terminal', async () => {
    const onContinue = vi.fn();
    const onRest = vi.fn();
    render(<BlockDone {...props({ block: 'historia', onContinue, onRest })} />);

    await userEvent.click(screen.getByRole('button', { name: HISTORIA.secondary }));

    expect(onRest).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  /**
   * O lado seguro é o que não leva ninguém embora. Na Triagem é o primário (a
   * estação seguinte já está atrás); na história concluída o primário É a saída,
   * então o Esc e o foco inicial vão para "Olhar de novo".
   */
  it('o Esc e o foco inicial ficam no lado seguro de cada bloco: "Olhar de novo" na história, o primário na Triagem', async () => {
    const onContinue = vi.fn();
    const onRest = vi.fn();
    const { unmount } = render(<BlockDone {...props({ block: 'historia', onContinue, onRest })} />);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: HISTORIA.secondary }));
    await userEvent.keyboard('{Escape}');
    expect(onRest).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
    unmount();

    const onContinueTriagem = vi.fn();
    const onRestTriagem = vi.fn();
    render(
      <BlockDone
        {...props({ block: 'triagem', onContinue: onContinueTriagem, onRest: onRestTriagem })}
      />,
    );

    expect(document.activeElement).toBe(screen.getByRole('button', { name: TRIAGEM.primary }));
    await userEvent.keyboard('{Escape}');
    expect(onContinueTriagem).toHaveBeenCalledTimes(1);
    expect(onRestTriagem).not.toHaveBeenCalled();
  });

  /**
   * ENG-689 — no limite que FECHA o fluxo não há para onde continuar, e quem monta
   * a tela omite o `onRest`. Duas ações para o mesmo destino não são uma escolha.
   */
  it('sem quem trate o descansar, a tela fica com uma ação só', () => {
    render(<BlockDone {...props({ onRest: undefined })} />);

    expect(screen.getByRole('button', { name: TRIAGEM.primary })).toBeDefined();
    expect(screen.queryByRole('button', { name: REST })).toBeNull();
  });

  it('o botão que continua avisa quem continua; o de descansar, quem guarda', async () => {
    const onContinue = vi.fn();
    const onRest = vi.fn();
    render(<BlockDone {...props({ onContinue, onRest })} />);

    await userEvent.click(screen.getByRole('button', { name: TRIAGEM.primary }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onRest).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: REST }));
    expect(onRest).toHaveBeenCalledTimes(1);
  });

  it('declara UMA ação dominante, e é a que continua (§9.2)', () => {
    render(<BlockDone {...props()} />);
    const dominant = screen
      .getAllByRole('dialog')[0]!
      .querySelectorAll('[data-role="primary-action"]');
    expect(dominant.length).toBe(1);
    expect(dominant[0]!.textContent).toBe(TRIAGEM.primary);
  });

  it('não mostra dígito, contagem nem id — é tela do ouvinte (§9.2)', () => {
    const { rerender } = render(<BlockDone {...props({ block: 'triagem' })} />);
    expect(screen.getByRole('dialog').textContent ?? '').not.toMatch(/\d/);

    rerender(<BlockDone {...props({ block: 'historia' })} />);
    expect(screen.getByRole('dialog').textContent ?? '').not.toMatch(/\d/);
  });

  it('as contas são decorativas: cinco, a última fechando o fio', () => {
    const { container } = render(<BlockDone {...props()} />);
    const beads = container.ownerDocument.querySelectorAll('.cds-block-done-beads .cds-pearl');
    expect(beads.length).toBe(5);
    expect(beads[4]!.getAttribute('data-scene-end')).toBe('true');
    expect(beads[0]!.getAttribute('data-scene-end')).toBeNull();
  });

  it('as cores das contas vêm dos dados, não de literais na tela', () => {
    const { container } = render(
      <BlockDone {...props({ block: 'historia', tints: scenePalette.slice(0, 5) })} />,
    );
    const beads = container.ownerDocument.querySelectorAll<HTMLElement>(
      '.cds-block-done-beads .cds-pearl',
    );
    expect(beads[0]!.style.getPropertyValue('--cds-pearl-base')).toBe(scenePalette[0]!.base);
    expect(beads[3]!.style.getPropertyValue('--cds-pearl-base')).toBe(scenePalette[3]!.base);
  });
});

/** Maior z-index declarado num css — o teto que a tela cheia precisa vencer. */
function maxZ(css: string): number {
  return Math.max(0, ...[...css.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1])));
}

describe('BlockDone — cobre o chrome inteiro, não só a estação', () => {
  /**
   * Regressão de empilhamento (ENG-651, achada por inspeção visual — nenhum teste
   * de DOM a apanha, porque hit-testing e PINTURA divergem: o Radix põe
   * `pointer-events: none` no resto da página, então `elementFromPoint` responde
   * "a tela está por cima" enquanto o cabeçalho pinta em cima dela).
   *
   * Sem z-index próprio a tela ficava sob o cabeçalho (`sticky z-index:30`) e sob
   * a camada de addons (`fixed z-index:20`): "← Histórias" e o "?" apareciam por
   * cima do fim de bloco, oferecendo saídas que esta tela não oferece.
   *
   * O teste compara com os css REAIS desses dois — subir o cabeçalho para 60 sem
   * subir esta tela volta a quebrar, e aqui falha.
   */
  it('declara um z-index acima de todo o chrome do shell', () => {
    // `parseRules` arrasta o comentário anterior para dentro do seletor: casa a
    // ÚLTIMA linha dele, que é o seletor de verdade.
    const rule = parseRules(blockDoneCss).find(
      (r) => r.selector.split('\n').pop()?.trim() === '.cds-block-done',
    );
    const own = maxZ(rule?.body ?? '');
    expect(own).toBeGreaterThan(maxZ(headerCss));
    expect(own).toBeGreaterThan(maxZ(addonsCss));
  });
});

describe('BlockDone — movimento só para quem o aceita (§4.5)', () => {
  const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;

  it('toda animação do css vive dentro da guarda de opt-in', () => {
    expect(blockDoneCss).toMatch(guard);
    expect(splitByGuard(blockDoneCss, guard).outside).not.toMatch(/animation|@keyframes/);
  });
});
