import { describe, expect, it } from 'vitest';

import type { CreateSessionRequest, SessionSummary } from '../../contracts';
import { FixtureConnectivityMonitor } from '../connectivity/fixture';
import { HttpSessionStore } from './http';
import type { CreateSessionInput } from './types';

const input: CreateSessionInput = {
  projectId: 'proj-1',
  storyName: 'A lenda do rio',
  storySlug: 'a-lenda-do-rio',
  audioId: 'aud-1',
  granularityLevel: 'medium',
  beadSec: 0.25,
  manifestId: 'fnv1a32:5a1b22f1',
  pipelineConsent: true,
};

const summary: SessionSummary = {
  id: 'sess-9',
  project_id: 'proj-1',
  story_name: 'A lenda do rio',
  story_slug: 'a-lenda-do-rio',
  status: 'in_progress',
  last_modified: '2026-07-10T00:00:00.000Z',
  progress: { current_step: 'listen' },
};

describe('HttpSessionStore', () => {
  it('create POSTs the CreateSessionRequest body and parses the summary', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchStub: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(summary), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const store = new HttpSessionStore({
      baseUrl: 'https://api.test',
      fetch: fetchStub,
      monitor: new FixtureConnectivityMonitor(true),
      user: { user_id: 'u', display_name: 'U' },
    });

    const out = await store.create(input);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error('esperava uma chamada de fetch');
    expect(call.url).toBe('https://api.test/sessions');
    expect(call.init?.method).toBe('POST');
    const body = JSON.parse(String(call.init?.body)) as CreateSessionRequest;
    expect(body.audio_id).toBe('aud-1');
    expect(body.granularity_level).toBe('medium');
    expect(body.pipeline_consent).toBe(true);
    expect(out.id).toBe('sess-9');
  });
});
