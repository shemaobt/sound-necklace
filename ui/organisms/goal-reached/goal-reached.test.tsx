import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import { GoalReached } from './goal-reached';
import goalCss from './goal-reached.css?raw';

/**
 * A meta de hoje alcançada (ENG-653). Chegou onde os dois combinaram chegar: o
 * app diz isso e oferece parar — sem obrigar, e sem tirar ninguém de onde está.
 *
 * Os testes olham para a tela: o que aparece, o que some, e onde a pessoa fica.
 */

const HEADLINE = 'A meta de hoje está no cordão.';
const KEEP = 'Seguir mais um pouco';
const STOP = 'Guardar por hoje';

/** Onde a pessoa estava quando a meta foi alcançada. */
const STATION = 'a pergunta em que eu estava';
/** Para onde "Guardar por hoje" leva. */
const DASHBOARD = 'Suas histórias';

/** Silêncio: o chime e o aviso de abertura são do shell, não desta tela. */
const silent = (): void => undefined;

/**
 * O palco mínimo: uma estação embaixo, e um "sair" que a troca pelo painel — é
 * assim que se vê, pela tela, a diferença entre ficar e sair.
 */
function Harness({ reached, busy = false }: { reached: boolean; busy?: boolean }) {
  const [left, setLeft] = useState(false);
  if (left) return <p>{DASHBOARD}</p>;
  return (
    <>
      <p>{STATION}</p>
      <GoalReached
        reached={reached}
        busy={busy}
        chime={silent}
        onOpenChange={silent}
        onStopForToday={() => setLeft(true)}
      />
    </>
  );
}

describe('A meta de hoje alcançada (ENG-653)', () => {
  it('antes de alcançar a meta, não aparece nada', () => {
    render(<Harness reached={false} />);

    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.getByText(STATION)).toBeTruthy();
  });

  it('alcançada a meta, a tela aparece com as duas saídas', () => {
    render(<Harness reached />);

    expect(screen.getByText(HEADLINE)).toBeTruthy();
    expect(screen.getByRole('button', { name: KEEP })).toBeTruthy();
    expect(screen.getByRole('button', { name: STOP })).toBeTruthy();
  });

  it('"Seguir mais um pouco" fecha e deixa a pessoa onde ela estava', () => {
    render(<Harness reached />);

    act(() => screen.getByRole('button', { name: KEEP }).click());

    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.getByText(STATION)).toBeTruthy();
    expect(screen.queryByText(DASHBOARD)).toBeNull();
  });

  it('"Guardar por hoje" leva ao painel de histórias', () => {
    render(<Harness reached />);

    act(() => screen.getByRole('button', { name: STOP }).click());

    expect(screen.getByText(DASHBOARD)).toBeTruthy();
    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.queryByText(STATION)).toBeNull();
  });

  it('dispensada uma vez, alcançar a meta de novo na mesma sessão não traz nada', () => {
    const { rerender } = render(<Harness reached />);
    act(() => screen.getByRole('button', { name: KEEP }).click());

    // a barra recua e volta a cruzar a marca — é a mesma sessão, e a tela é uma só
    rerender(<Harness reached={false} />);
    rerender(<Harness reached />);

    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.getByText(STATION)).toBeTruthy();
  });

  it('não sobe por cima do que está em curso — e chega assim que a pressa passa', () => {
    const { rerender } = render(<Harness reached busy />);
    expect(screen.queryByText(HEADLINE)).toBeNull();

    rerender(<Harness reached busy={false} />);

    expect(screen.getByText(HEADLINE)).toBeTruthy();
  });

  it('não mostra número, contagem nem id a quem ouve (§9.2)', () => {
    render(<Harness reached />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent ?? '').not.toMatch(/\d/);
    for (const el of dialog.querySelectorAll('[aria-label], [title]')) {
      expect(el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '').not.toMatch(/\d/);
    }
  });

  it('todo movimento vive dentro da guarda de prefers-reduced-motion (§4.5)', () => {
    const { outside } = splitByGuard(
      goalCss,
      /@media[^{]*prefers-reduced-motion:\s*no-preference[^{]*/,
    );
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
