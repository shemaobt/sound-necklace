import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FixtureSessionStore } from '../../adapters/sessions';
import { sessionStore } from '../state';
import { appSessionBackend, appSessionStore } from './session-adapter';
import {
  ACQUIRE_MAX_RETRY_MS,
  ACQUIRE_RETRY_MS,
  HEARTBEAT_MS,
  RENEW_DEADLINE_MS,
  useEditorLock,
} from './use-editor-lock';

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

/**
 * BroadcastChannel determinístico para jsdom (que não o implementa): entrega
 * SÍNCRONA aos outros canais do mesmo nome — nunca ao próprio, como no spec.
 */
class FakeBroadcastChannel {
  static registry = new Map<string, Set<FakeBroadcastChannel>>();
  #listeners = new Set<(ev: MessageEvent) => void>();

  constructor(readonly name: string) {
    const set = FakeBroadcastChannel.registry.get(name) ?? new Set();
    set.add(this);
    FakeBroadcastChannel.registry.set(name, set);
  }

  addEventListener(_type: 'message', cb: (ev: MessageEvent) => void): void {
    this.#listeners.add(cb);
  }

  postMessage(data: unknown): void {
    for (const ch of FakeBroadcastChannel.registry.get(this.name) ?? []) {
      if (ch === this) continue;
      ch.#listeners.forEach((cb) => cb({ data } as MessageEvent));
    }
  }

  close(): void {
    FakeBroadcastChannel.registry.get(this.name)?.delete(this);
  }
}

describe('useEditorLock — a mesma sessão numa segunda aba da mesma conta (ENG-328)', () => {
  beforeEach(() => {
    FakeBroadcastChannel.registry.clear();
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    sessionStore.getState().setLock(null);
    sessionStore.getState().setReview(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a aba que edita cai para revisão quando outra aba reivindica a sessão', async () => {
    const id = await newSession();
    const hook = renderHook(() => useEditorLock(id));
    await settle(); // adquiriu: editando
    expect(sessionStore.getState().lock).toBeNull();

    // a "outra aba": um canal do mesmo nome anuncia a própria montagem
    const other = new FakeBroadcastChannel(`cds-session-${id}`);
    other.postMessage({ tabId: 'outra-aba' });

    expect(sessionStore.getState().lock).toEqual({ holder: null, otherTab: true });
    hook.unmount();
  });

  it('reivindicação de OUTRA sessão não demite (o canal é por sessão)', async () => {
    const id = await newSession();
    const hook = renderHook(() => useEditorLock(id));
    await settle();

    const other = new FakeBroadcastChannel(`cds-session-nao-e-esta`);
    other.postMessage({ tabId: 'outra-aba' });

    expect(sessionStore.getState().lock).toBeNull();
    hook.unmount();
  });

  it('reivindicação chegando DURANTE o acquire não é atropelada pela promoção', async () => {
    const id = await newSession();
    const hook = renderHook(() => useEditorLock(id));
    // sem settle: o acquire ainda voa quando a outra aba reivindica
    const other = new FakeBroadcastChannel(`cds-session-${id}`);
    other.postMessage({ tabId: 'outra-aba' });
    await settle(); // agora o acquire resolve — e NÃO pode limpar a demissão

    expect(sessionStore.getState().lock).toEqual({ holder: null, otherTab: true });
    hook.unmount();
  });

  it('desmontar fecha o canal: reivindicações posteriores não escrevem mais', async () => {
    const id = await newSession();
    const hook = renderHook(() => useEditorLock(id));
    await settle();
    hook.unmount();
    sessionStore.getState().setLock(null);

    const other = new FakeBroadcastChannel(`cds-session-${id}`);
    other.postMessage({ tabId: 'outra-aba' });

    expect(sessionStore.getState().lock).toBeNull();
  });
});

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

  it('acquire falhado põe a sessão em revisão (holder desconhecido) — sem lease não se edita', async () => {
    const id = await newSession();
    vi.spyOn(appSessionStore(), 'acquireLock').mockRejectedValue(new Error('rede fora'));

    const { unmount } = renderHook(() => useEditorLock(id));
    await settle();

    expect(sessionStore.getState().lock).toEqual({ holder: null });
    unmount();
  });

  it('acquire falhado tenta de novo, e o sucesso seguinte promove a editar', async () => {
    // ENG-338: uma única tentativa parqueava a sessão em revisão até um F5. Um soluço
    // de rede na entrada da sessão não pode custar a sessão inteira.
    const id = await newSession();
    const store = appSessionStore();
    const mine = await store.lockStatus(id);
    const acquire = vi
      .spyOn(store, 'acquireLock')
      .mockRejectedValueOnce(new Error('soluço de rede'))
      .mockResolvedValue({ ...mine, held: true, holder: store.me });
    const renew = vi.spyOn(store, 'renewLock');

    const { unmount } = renderHook(() => useEditorLock(id));
    await settle();
    expect(sessionStore.getState().lock).toEqual({ holder: null }); // parqueada

    await act(() => vi.advanceTimersByTimeAsync(ACQUIRE_RETRY_MS));

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(sessionStore.getState().lock).toBeNull(); // editando de novo
    // "exatamente como um acquire fresco": o heartbeat também tem de estar de pé,
    // senão o lease de 60s caduca com o editor ainda dentro da sessão.
    await act(() => vi.advanceTimersByTimeAsync(HEARTBEAT_MS));
    expect(renew).toHaveBeenCalled();

    unmount();
  });

  it('a espera entre tentativas cresce, e o teto a segura', async () => {
    const id = await newSession();
    const acquire = vi
      .spyOn(appSessionStore(), 'acquireLock')
      .mockRejectedValue(new Error('rede fora'));

    const { unmount } = renderHook(() => useEditorLock(id));
    await settle();
    expect(acquire).toHaveBeenCalledTimes(1);

    // a segunda tentativa NÃO cai no mesmo intervalo da primeira: sem crescimento,
    // uma frota reconectando depois de um deploy martela o pooler em uníssono.
    await act(() => vi.advanceTimersByTimeAsync(ACQUIRE_RETRY_MS));
    expect(acquire).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(ACQUIRE_RETRY_MS));
    expect(acquire).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(ACQUIRE_RETRY_MS));
    expect(acquire).toHaveBeenCalledTimes(3);

    // e o crescimento para no teto — sem isso a espera dobraria até o infinito e a
    // sessão nunca mais voltaria sozinha
    await act(() => vi.advanceTimersByTimeAsync(ACQUIRE_MAX_RETRY_MS * 8));
    const noTeto = acquire.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(ACQUIRE_MAX_RETRY_MS));
    expect(acquire.mock.calls.length).toBe(noTeto + 1);

    // a sessão segue parqueada com o aviso de reconexão o tempo todo
    expect(sessionStore.getState().lock).toEqual({ holder: null });
    unmount();
  });

  it('sair da sessão para as tentativas — nada bate no servidor depois de desmontar', async () => {
    const id = await newSession();
    const acquire = vi
      .spyOn(appSessionStore(), 'acquireLock')
      .mockRejectedValue(new Error('rede fora'));

    const { unmount } = renderHook(() => useEditorLock(id));
    await settle();
    unmount();

    const depoisDeSair = acquire.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(ACQUIRE_MAX_RETRY_MS * 4));
    expect(acquire.mock.calls.length).toBe(depoisDeSair);
  });

  it('não retenta sob a trava de outra pessoa — isso não é falha, é a sessão em uso', async () => {
    const id = await newSession();
    const other = new FixtureSessionStore({
      backend: appSessionBackend(),
      user: { user_id: 'u-ana', display_name: 'Ana' },
    });
    await other.acquireLock(id);
    const acquire = vi.spyOn(appSessionStore(), 'acquireLock');

    const { unmount } = renderHook(() => useEditorLock(id));
    await settle();
    expect(sessionStore.getState().lock).toEqual({ holder: 'Ana' });

    await act(() => vi.advanceTimersByTimeAsync(ACQUIRE_MAX_RETRY_MS * 4));
    expect(acquire).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('reivindicação de outra aba durante a espera cancela as tentativas', async () => {
    // o guard `claimed` da ENG-328 vale para o retry também: sem isto uma tentativa
    // tardia bem-sucedida limparia a demissão que a outra aba acabou de escrever.
    FakeBroadcastChannel.registry.clear();
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const id = await newSession();
    const acquire = vi
      .spyOn(appSessionStore(), 'acquireLock')
      .mockRejectedValue(new Error('rede fora'));

    const { unmount } = renderHook(() => useEditorLock(id));
    await settle();

    new FakeBroadcastChannel(`cds-session-${id}`).postMessage({ tabId: 'outra-aba' });
    const antes = acquire.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(ACQUIRE_MAX_RETRY_MS * 4));

    expect(acquire.mock.calls.length).toBe(antes);
    expect(sessionStore.getState().lock).toEqual({ holder: null, otherTab: true });
    unmount();
    vi.unstubAllGlobals();
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

  it('deadline vencido com renovação em voo não demite quando o servidor responde "é sua"', async () => {
    // ENG-331: com a aba dormindo (background/display do Mac), beat e deadline
    // congelam JUNTOS e disparam em rajada ao acordar — o beat põe um renew em
    // voo e o deadline vencia antes de a resposta chegar, demitindo um editor
    // saudável. Demitido, o apply() vira no-op: os toques no colar são engolidos
    // e a Escuta 2 repete "Clique onde a cena termina" sem nunca criar a cena 2.
    const id = await newSession();
    const store = appSessionStore();
    const mine = await store.acquireLock(id);
    const pending: ((s: typeof mine) => void)[] = [];
    vi.spyOn(store, 'renewLock').mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );

    const { unmount } = renderHook(() => useEditorLock(id));
    await settle();
    expect(sessionStore.getState().lock).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(HEARTBEAT_MS)); // beat: renew fica em voo
    await act(() => vi.advanceTimersByTimeAsync(RENEW_DEADLINE_MS)); // deadline vence na rajada
    // o servidor está saudável: toda renovação pendente responde "a trava é sua"
    await act(async () => {
      pending.forEach((resolve) => resolve(mine));
    });

    expect(sessionStore.getState().lock).toBeNull();
    expect(sessionStore.getState().review).toBe(false);
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
