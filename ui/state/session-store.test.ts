import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildBeads, createSession, type SessionState } from '../../domain';
import { createSessionStore, type SessionStore } from './session-store';

function sampleSession(): SessionState {
  const beadSec = 0.25;
  const beads = buildBeads(2, beadSec);
  return createSession({
    durationSec: 2,
    beadSec,
    beads,
    manifestId: 'fnv1a32:deadbeef',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
}

/** Reducer de teste: uma transformação pura e observável do estado. */
const rename = (s: SessionState): SessionState => ({ ...s, slug: `${s.slug}-editada` });

describe('session store — edição guardada', () => {
  let store: ReturnType<typeof createSessionStore>;
  let autosave: ReturnType<typeof vi.fn<(state: SessionState) => void>>;

  beforeEach(() => {
    autosave = vi.fn<(state: SessionState) => void>();
    store = createSessionStore({ autosave });
    store.getState().load(sampleSession());
  });

  const state = (): SessionStore => store.getState();

  it('aplica o reducer e persiste via autosave quando pode editar', () => {
    state().apply(rename);

    expect(state().session?.slug).toBe('historia-editada');
    expect(autosave).toHaveBeenCalledTimes(1);
    expect(autosave.mock.calls[0]![0].slug).toBe('historia-editada');
  });

  it('em revisão, bloqueia a mutação e preserva o estado (sem autosave)', () => {
    const before = state().session;
    state().setReview(true);

    state().apply(rename);

    expect(state().session).toBe(before);
    expect(autosave).not.toHaveBeenCalled();
  });

  it('destravar restaura a edição', () => {
    state().setReview(true);
    state().unlock();

    state().apply(rename);

    expect(state().session?.slug).toBe('historia-editada');
  });

  it('offline pausa a edição preservando o estado; ao voltar, edita de novo', () => {
    const before = state().session;
    state().setOnline(false);

    state().apply(rename);
    expect(state().session).toBe(before);

    state().setOnline(true);
    state().apply(rename);
    expect(state().session?.slug).toBe('historia-editada');
  });

  it('trava por outro editor força revisão e impede destravar', () => {
    state().setLock({ holder: 'Ana' });
    expect(state().review).toBe(true);

    state().unlock();
    expect(state().review).toBe(true);

    state().apply(rename);
    expect(state().session?.slug).toBe('historia');
  });

  it('liberada a trava, destravar volta a permitir edição', () => {
    state().setLock({ holder: 'Ana' });
    state().setLock(null);
    state().unlock();

    state().apply(rename);
    expect(state().session?.slug).toBe('historia-editada');
  });

  it('setAutosave liga a porta num store já criado sem porta', () => {
    const bare = createSessionStore(); // sem autosave
    bare.getState().load(sampleSession());
    const late = vi.fn<(state: SessionState) => void>();

    bare.getState().apply(rename);
    expect(late).not.toHaveBeenCalled();

    bare.getState().setAutosave(late);
    bare.getState().apply(rename);
    expect(late).toHaveBeenCalledTimes(1);
    expect(late.mock.calls[0]![0].slug).toBe('historia-editada-editada');
  });
});
