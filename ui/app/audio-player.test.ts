import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FixtureTransport, HeadListener, Player } from '../../adapters/audio';
import { toSessionDto } from '../../contracts';
import { buildBeads, createSession, type SessionState } from '../../domain';
import { buildSessionPlayer, createDeferredPlayer, startClockBridge } from './audio-player';
import { appSessionStore } from './session-adapter';

function sample(): SessionState {
  return createSession({
    durationSec: 3,
    beadSec: 0.25,
    beads: buildBeads(3, 0.25),
    manifestId: 'fnv1a32:deadbeef',
    audioFilename: 'conto-do-boto.wav',
    slug: 'conto-do-boto',
  });
}

async function seed(bucketAudioId: string): Promise<string> {
  const store = appSessionStore();
  const summary = await store.create({
    projectId: 'p1',
    storyName: 'H',
    storySlug: 'h',
    audioId: bucketAudioId,
    granularityLevel: 'medium',
    beadSec: 0.25,
    manifestId: 'fnv1a32:deadbeef',
    pipelineConsent: true,
  });
  store.autosave(
    summary.id,
    toSessionDto(sample(), {
      granularityLevel: 'medium',
      bucketAudioId,
      voice: [],
      pipelineConsent: true,
    }),
  );
  await store.flush(summary.id);
  return summary.id;
}

beforeEach(() => {
  localStorage.clear();
});

describe('startClockBridge', () => {
  it('avança o transporte pelo delta entre frames e cancela no teardown', () => {
    const advanced: number[] = [];
    const transport = {
      advance: (dt: number) => advanced.push(dt),
    } as unknown as FixtureTransport;

    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);

    const stop = startClockBridge(transport);
    frames[0]!(1000); // baseline: ainda sem delta
    expect(advanced).toEqual([]);
    frames[1]!(1016); // 16 ms → 0,016 s
    expect(advanced).toEqual([0.016]);
    frames[2]!(1032);
    expect(advanced).toEqual([0.016, 0.016]);

    stop();
    expect(caf).toHaveBeenCalled();

    raf.mockRestore();
    caf.mockRestore();
  });
});

function fakePlayer(): Player & { calls: string[]; emit: (head: number | null) => void } {
  const calls: string[] = [];
  const listeners = new Set<HeadListener>();
  return {
    calls,
    emit: (head) => listeners.forEach((cb) => cb(head)),
    toggle: (k, s, e) => calls.push(`toggle:${k}:${s}:${e}`),
    play: (s, e) => calls.push(`play:${s}:${e}`),
    playEdge: (b) => calls.push(`edge:${b}`),
    stop: () => calls.push('stop'),
    state: { key: null, playing: false, paused: false },
    onHead: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

describe('createDeferredPlayer', () => {
  it('guarda a última intenção durante a espera e a executa ao anexar o player real', () => {
    const { player, attach } = createDeferredPlayer();
    const real = fakePlayer();

    player.play(0, 3); // clique engolido hoje — deve virar intenção
    player.playEdge(5); // intenção mais nova vence
    expect(real.calls).toEqual([]);

    attach(real);
    expect(real.calls).toEqual(['edge:5']);
  });

  it('encaminha comandos direto depois de anexado', () => {
    const { player, attach } = createDeferredPlayer();
    const real = fakePlayer();
    attach(real);

    player.toggle('cena', 1, 4);
    player.play(2, 2);
    expect(real.calls).toEqual(['toggle:cena:1:4', 'play:2:2']);
  });

  it('stop durante a espera descarta a intenção pendente', () => {
    const { player, attach } = createDeferredPlayer();
    const real = fakePlayer();

    player.play(0, 3);
    player.stop();
    attach(real);
    expect(real.calls).toEqual([]);
  });

  it('inscrições de onHead feitas na espera passam a receber do player real', () => {
    const { player, attach } = createDeferredPlayer();
    const real = fakePlayer();
    const heads: (number | null)[] = [];
    const off = player.onHead((h) => heads.push(h));

    attach(real);
    real.emit(7);
    expect(heads).toEqual([7]);

    off();
    real.emit(8);
    expect(heads).toEqual([7]);
  });

  it('estado é ocioso na espera e reflete o real depois', () => {
    const { player, attach } = createDeferredPlayer();
    expect(player.state).toEqual({ key: null, playing: false, paused: false });

    const real = fakePlayer();
    (real as { state: Player['state'] }).state = { key: 'cena', playing: true, paused: false };
    attach(real);
    expect(player.state).toEqual({ key: 'cena', playing: true, paused: false });
  });
});

describe('buildSessionPlayer', () => {
  it('re-decodifica o áudio do bucket da sessão num player vivo', async () => {
    const id = await seed('aud_conto_do_boto');
    const audio = await buildSessionPlayer(id);
    expect(typeof audio.player.play).toBe('function');
    expect(typeof audio.player.toggle).toBe('function');
    expect(typeof audio.player.playEdge).toBe('function');
    audio.stop(); // cancela a ponte de relógio
  });

  it('rejeita quando o áudio do bucket da sessão não existe', async () => {
    const id = await seed('aud_inexistente');
    await expect(buildSessionPlayer(id)).rejects.toBeTruthy();
  });
});
