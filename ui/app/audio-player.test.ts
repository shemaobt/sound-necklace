import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FixtureTransport } from '../../adapters/audio';
import { toSessionDto } from '../../contracts';
import { buildBeads, createSession, type SessionState } from '../../domain';
import { buildSessionPlayer, startClockBridge } from './audio-player';
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
