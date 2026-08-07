import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IDLE_GAP_MS,
  TICK_MS,
  freezeClock,
  markActivity,
  netTimeParts,
  readClock,
  resumeClock,
  startClock,
  useSessionClock,
} from './session-clock';

/**
 * O relógio LÍQUIDO da sessão: quanto tempo de trabalho a sessão custou, sem as
 * pausas longas (fechar a aba, sair para o almoço, a máquina dormir). Vive só
 * neste browser — nada disso vai para a rede (o CLAUDE.md proíbe telemetria de
 * comportamento), e nada disso entra em artefato.
 */

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('relógio líquido — o que conta', () => {
  it('soma os intervalos curtos entre um sinal de vida e o seguinte', () => {
    startClock('s1', 1_000);
    markActivity('s1', 61_000);
    markActivity('s1', 121_000);

    expect(readClock('s1').netMs).toBe(120_000);
  });

  it('a abertura NÃO conta o que veio antes dela: começar é marco zero, não retroativo', () => {
    startClock('s1', 5_000_000);

    expect(readClock('s1').netMs).toBe(0);
  });

  it('uma pausa longa não conta — é nisso que "líquido" difere de "corrido"', () => {
    startClock('s1', 0);
    markActivity('s1', 60_000); // +1 min de trabalho
    const afterPause = 60_000 + IDLE_GAP_MS + 1;
    markActivity('s1', afterPause); // a pausa inteira é descartada
    markActivity('s1', afterPause + 30_000); // +30 s de trabalho

    expect(readClock('s1').netMs).toBe(90_000);
  });

  it('cada sessão tem o próprio relógio', () => {
    startClock('s1', 0);
    startClock('s2', 0);
    markActivity('s1', 60_000);

    expect(readClock('s1').netMs).toBe(60_000);
    expect(readClock('s2').netMs).toBe(0);
  });

  it('sobrevive ao reload: o acumulado está guardado, não na memória da aba', () => {
    startClock('s1', 0);
    markActivity('s1', 60_000);

    // uma aba nova só sabe o que ficou guardado
    expect(readClock('s1').netMs).toBe(60_000);
    startClock('s1', 9_000_000); // reabriu muito depois
    markActivity('s1', 9_030_000);

    expect(readClock('s1').netMs).toBe(90_000);
  });
});

describe('relógio líquido — concluir congela o número', () => {
  it('congelado, o relógio para: o número da conclusão não escorrega enquanto a tela fica aberta', () => {
    startClock('s1', 0);
    markActivity('s1', 60_000);

    expect(freezeClock('s1')).toBe(60_000);
    markActivity('s1', 120_000);
    expect(readClock('s1').netMs).toBe(60_000);
  });

  it('destravar para editar volta a contar sem perder o acumulado, e a pausa não entra', () => {
    startClock('s1', 0);
    markActivity('s1', 60_000);
    freezeClock('s1');
    resumeClock('s1', 600_000); // voltou muito depois
    markActivity('s1', 630_000);

    expect(readClock('s1').netMs).toBe(90_000);
  });
});

describe('relógio líquido — o pulso da sessão aberta', () => {
  it('com a sessão aberta e a aba à vista, o relógio anda sozinho', () => {
    vi.useFakeTimers({ now: 0 });
    renderHook(() => useSessionClock('s1'));

    vi.advanceTimersByTime(TICK_MS * 4);

    expect(readClock('s1').netMs).toBe(TICK_MS * 4);
  });

  it('aba escondida não acumula: guardar a janela é pausa, não trabalho', () => {
    vi.useFakeTimers({ now: 0 });
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    renderHook(() => useSessionClock('s1'));

    vi.advanceTimersByTime(TICK_MS * 4);

    expect(readClock('s1').netMs).toBe(0);
    spy.mockRestore();
  });

  it('sem sessão não há relógio', () => {
    vi.useFakeTimers({ now: 0 });
    renderHook(() => useSessionClock(null));

    vi.advanceTimersByTime(TICK_MS * 4);

    expect(localStorage.length).toBe(0);
  });
});

describe('relógio líquido — como o número se lê', () => {
  it('separa horas e minutos, e nunca arredonda para cima', () => {
    expect(netTimeParts(0)).toEqual({ hours: 0, minutes: 0 });
    expect(netTimeParts(59_999)).toEqual({ hours: 0, minutes: 0 });
    expect(netTimeParts(30 * 60_000)).toEqual({ hours: 0, minutes: 30 });
    expect(netTimeParts(90 * 60_000)).toEqual({ hours: 1, minutes: 30 });
    expect(netTimeParts(3 * 3_600_000)).toEqual({ hours: 3, minutes: 0 });
  });
});
