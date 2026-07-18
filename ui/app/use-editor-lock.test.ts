import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FixtureSessionStore } from '../../adapters/sessions';
import { sessionStore } from '../state';
import { appSessionBackend, appSessionStore } from './session-adapter';
import { HEARTBEAT_MS, RENEW_DEADLINE_MS, useEditorLock } from './use-editor-lock';

/** Sessão vazia no backend app-global — o hook só precisa que o id exista. */
async function newSession(): Promise<string> {
  const summary = await appSessionStore().create({
    projectId: 'p1',
    storyName: 'H',
    storySlug: 'h',
    audioId: 'a1',
    granularityLevel: 'medium',
    beadSec: 0.25,
    manifestId: 'fnv1a32:deadbeef',
    pipelineConsent: true,
  });
  return summary.id;
}

/** Deixa as promises do adapter (fixture, sem latência) assentarem. */
const settle = () => act(async () => {});

describe('useEditorLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jitter determinístico: o beat cai no piso da janela (HEARTBEAT_MS exato).
    vi.spyOn(Math, 'random').mockReturnValue(0);
    sessionStore.getState().setLock(null);
    sessionStore.getState().setReview(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('estabelece a trava desta sessão do zero ao montar — a da anterior não vaza', async () => {
    const id = await newSession();
    // sobra da sessão anterior (troca in-SPA): sem o reset síncrono, este holder
    // ficaria visível até o acquire responder — e para sempre se o acquire falhar
    sessionStore.getState().setLock({ holder: 'Alice' });

    const { unmount } = renderHook(() => useEditorLock(id));
    expect(sessionStore.getState().lock).toBeNull();

    await settle();
    unmount();
  });

  it('renova a trava periodicamente enquanto a sessão fica aberta', async () => {
    const id = await newSession();
    const renew = vi.spyOn(appSessionStore(), 'renewLock');
    const { unmount } = renderHook(() => useEditorLock(id));
    await settle();

    await act(() => vi.advanceTimersByTimeAsync(HEARTBEAT_MS));
    expect(renew).toHaveBeenCalledTimes(1);

    // sem estas batidas o lease de 60s do tripod-api (ENG-262) caduca sozinho e a
    // sessão fica livre para outra pessoa enquanto esta ainda edita.
    await act(() => vi.advanceTimersByTimeAsync(HEARTBEAT_MS));
    expect(renew).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('sem renovação bem-sucedida dentro do prazo, demota-se à revisão por conta própria', async () => {
    const id = await newSession();
    const { unmount } = renderHook(() => useEditorLock(id));
    await settle();
    expect(sessionStore.getState().review).toBe(false);

    // a rede engole as renovações: NENHUM 409 chega. Mesmo assim o cliente para de
    // agir antes do TTL de 60s — é o que fecha a janela de dois editores.
    vi.spyOn(appSessionStore(), 'renewLock').mockRejectedValue(new Error('rede caiu'));
    await act(() => vi.advanceTimersByTimeAsync(RENEW_DEADLINE_MS));

    expect(sessionStore.getState().review).toBe(true);
    expect(sessionStore.getState().lock).toEqual({ holder: null });
    expect(sessionStore.getState().canEdit()).toBe(false);

    unmount();
  });

  it('abre em revisão sob a trava de outra pessoa, e não tenta renovar o que não é seu', async () => {
    const id = await newSession();
    const other = new FixtureSessionStore({
      backend: appSessionBackend(),
      user: { user_id: 'u-ana', display_name: 'Ana' },
    });
    await other.acquireLock(id);
    const renew = vi.spyOn(appSessionStore(), 'renewLock');

    const { unmount } = renderHook(() => useEditorLock(id));
    await settle();

    expect(sessionStore.getState().lock).toEqual({ holder: 'Ana' });
    await act(() => vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3));
    expect(renew).not.toHaveBeenCalled();

    unmount();
  });

  it('solta a trava ao sair da sessão — a próxima pessoa não espera o TTL', async () => {
    const id = await newSession();
    const { unmount } = renderHook(() => useEditorLock(id));
    await settle();
    expect((await appSessionStore().lockStatus(id)).held).toBe(true);

    unmount();
    await settle();

    expect((await appSessionStore().lockStatus(id)).held).toBe(false);
  });
});
