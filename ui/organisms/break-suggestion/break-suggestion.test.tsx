import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import { BREAK_AFTER_MS, BREAK_SETTLE_MS, BreakSuggestion } from './break-suggestion';
import breakCss from './break-suggestion.css?raw';

/**
 * A pausa sugerida (ENG-650). Depois de um bom tempo de trabalho o app SUGERE
 * descansar — uma vez só, nunca por cima de algo em curso, e nunca bloqueando.
 *
 * Os testes olham para a tela: o que aparece, o que some, e onde a pessoa fica.
 * O relógio é falso para que 45 minutos caibam num teste; o resto é real.
 */

const HEADLINE = 'Já foi bastante coisa boa por agora.';
const TAKE = 'Fazer uma pausa';
const KEEP = 'Seguir mais um pouco';

/** Onde a pessoa estava quando a sugestão chegou. */
const STATION = 'a pergunta em que eu estava';
/** Para onde "Fazer uma pausa" leva. */
const DASHBOARD = 'Suas histórias';

/**
 * O palco mínimo em que a sugestão vive: uma estação embaixo, e um "sair" que
 * troca a estação pelo painel — é assim que se vê, pela tela, a diferença entre
 * ficar e sair.
 */
function Harness({ busy = false }: { busy?: boolean }) {
  const [left, setLeft] = useState(false);
  if (left) return <p>{DASHBOARD}</p>;
  return (
    <>
      <p>{STATION}</p>
      <BreakSuggestion busy={busy} onTakeBreak={() => setLeft(true)} />
    </>
  );
}

/** Avança o relógio da sessão em `ms`, deixando o React reagir. */
function passTime(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Um pouco além do limiar — o suficiente para a sugestão poder aparecer. */
const PAST_THRESHOLD = BREAK_AFTER_MS + 60_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('A pausa sugerida (ENG-650)', () => {
  it('antes do limiar, não aparece nada', () => {
    render(<Harness />);

    passTime(BREAK_AFTER_MS - 60_000);

    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.getByText(STATION)).toBeTruthy();
  });

  it('passado o limiar, a sugestão aparece', () => {
    render(<Harness />);

    passTime(PAST_THRESHOLD);

    expect(screen.getByText(HEADLINE)).toBeTruthy();
    expect(screen.getByRole('button', { name: TAKE })).toBeTruthy();
    expect(screen.getByRole('button', { name: KEEP })).toBeTruthy();
  });

  it('"Seguir mais um pouco" fecha e deixa a pessoa onde ela estava', () => {
    render(<Harness />);
    passTime(PAST_THRESHOLD);

    act(() => screen.getByRole('button', { name: KEEP }).click());

    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.getByText(STATION)).toBeTruthy();
    expect(screen.queryByText(DASHBOARD)).toBeNull();
  });

  it('depois de "Seguir mais um pouco", cruzar o limiar de novo não traz nada', () => {
    render(<Harness />);
    passTime(PAST_THRESHOLD);
    act(() => screen.getByRole('button', { name: KEEP }).click());

    passTime(PAST_THRESHOLD);

    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.getByText(STATION)).toBeTruthy();
  });

  it('depois de "Fazer uma pausa", voltar à estação não traz a sugestão de volta', () => {
    // sair e voltar SEM desmontar: é a mesma sessão, e a sugestão é uma só por sessão
    function BackAndForth() {
      const [left, setLeft] = useState(false);
      return (
        <>
          <p>{left ? DASHBOARD : STATION}</p>
          {left ? <button onClick={() => setLeft(false)}>voltar</button> : null}
          <BreakSuggestion busy={false} onTakeBreak={() => setLeft(true)} />
        </>
      );
    }
    render(<BackAndForth />);
    passTime(PAST_THRESHOLD);
    act(() => screen.getByRole('button', { name: TAKE }).click());
    act(() => screen.getByRole('button', { name: 'voltar' }).click());

    passTime(PAST_THRESHOLD);

    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.getByText(STATION)).toBeTruthy();
  });

  it('não aparece enquanto há uma gravação em curso', () => {
    render(<Harness busy />);

    passTime(PAST_THRESHOLD);

    expect(screen.queryByText(HEADLINE)).toBeNull();
  });

  it('a gravação terminada NÃO engole a sugestão: ela chega logo depois, não em cima', () => {
    const { rerender } = render(<Harness busy />);
    passTime(PAST_THRESHOLD);
    expect(screen.queryByText(HEADLINE)).toBeNull();

    // a gravação termina: nada aparece NO instante em que ela termina...
    rerender(<Harness busy={false} />);
    act(() => undefined);
    expect(screen.queryByText(HEADLINE)).toBeNull();

    // ...e sim no fôlego seguinte, com a pessoa já pousada na tela
    passTime(BREAK_SETTLE_MS);
    expect(screen.getByText(HEADLINE)).toBeTruthy();
  });

  it('não mostra número, contagem nem id a quem ouve (§9.2)', () => {
    render(<Harness />);
    passTime(PAST_THRESHOLD);

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent ?? '').not.toMatch(/\d/);
    for (const el of dialog.querySelectorAll('[aria-label], [title]')) {
      expect(el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '').not.toMatch(/\d/);
    }
  });

  it('todo movimento vive dentro da guarda de prefers-reduced-motion (§4.5)', () => {
    const { outside } = splitByGuard(
      breakCss,
      /@media[^{]*prefers-reduced-motion:\s*no-preference[^{]*/,
    );
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
