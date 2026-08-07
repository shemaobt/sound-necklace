import { describe, expect, it } from 'vitest';

import type { ResourcePath } from '../../contracts';
import { FixtureSessionBackend, FixtureSessionStore } from '../sessions';
import { SessionVoiceStore } from './session-store';

const PATH = 'respostas/level1/recontar.webm' as ResourcePath;

async function makeSession() {
  const store = new FixtureSessionStore({ backend: new FixtureSessionBackend() });
  const summary = await store.create({
    projectId: 'proj-1',
    storyName: 'A lenda do rio',
    storySlug: 'a-lenda-do-rio',
    audioId: 'aud-1',
    granularityLevel: 'medium',
    beadSec: 0.25,
    manifestId: 'fnv1a32:5a1b22f1',
    pipelineConsent: true,
  });
  return { store, id: summary.id };
}

describe('SessionVoiceStore — as respostas de voz vivem nos recursos da sessão (§10.4/O5)', () => {
  it('put/get/has/delete delegam aos recursos da sessão ligada', async () => {
    const { store, id } = await makeSession();
    const voice = new SessionVoiceStore(store, id);

    expect(await voice.has(PATH)).toBe(false);
    await voice.put(PATH, new Uint8Array([1, 2, 3]));
    expect(await voice.has(PATH)).toBe(true);
    expect(await voice.get(PATH)).toEqual(new Uint8Array([1, 2, 3]));

    await voice.delete(PATH);
    expect(await voice.has(PATH)).toBe(false);
  });

  it('duas sessões não dividem gravação — o namespace é a sessão (§10.4)', async () => {
    const backend = new FixtureSessionBackend();
    const store = new FixtureSessionStore({ backend });
    const a = await store.create({
      projectId: 'proj-1',
      storyName: 'A',
      storySlug: 'a',
      audioId: 'aud-1',
      granularityLevel: 'medium',
      beadSec: 0.25,
      manifestId: 'fnv1a32:5a1b22f1',
      pipelineConsent: true,
    });
    const b = await store.create({
      projectId: 'proj-1',
      storyName: 'B',
      storySlug: 'b',
      audioId: 'aud-1',
      granularityLevel: 'medium',
      beadSec: 0.25,
      manifestId: 'fnv1a32:5a1b22f1',
      pipelineConsent: true,
    });

    await new SessionVoiceStore(store, a.id).put(PATH, new Uint8Array([9]));

    expect(await new SessionVoiceStore(store, b.id).has(PATH)).toBe(false);
    expect(await new SessionVoiceStore(store, a.id).has(PATH)).toBe(true);
  });
});

/**
 * A rota `/resources` lista a SESSÃO INTEIRA e o recorte por prefixo é do cliente
 * (@/adapters/sessions/http.ts), então cada `has` pagava uma listagem completa. O
 * preparo pré-revisão consulta uma vez por pergunta, e uma sessão de 14 cenas chega
 * a ~396 perguntas: eram ~396 requisições, cada uma devolvendo a lista toda. A
 * ponytail registrada em `session-store.ts` desde a ENG-247 virou o gargalo.
 */
describe('SessionVoiceStore — a listagem é consultada uma vez, não uma por pergunta', () => {
  const P2 = 'respostas/level2/PT1/quem.webm' as ResourcePath;

  it('consultar muitas respostas custa UMA listagem', async () => {
    const { store, id } = await makeSession();
    const voice = new SessionVoiceStore(store, id);
    await voice.put(PATH, new Uint8Array([1]));
    let listings = 0;
    const original = store.listResources.bind(store);
    store.listResources = (sid, prefix) => {
      listings += 1;
      return original(sid, prefix);
    };

    expect(await voice.has(PATH)).toBe(true);
    expect(await voice.has(P2)).toBe(false);
    expect(await voice.has(PATH)).toBe(true);

    expect(listings).toBe(1);
  });

  it('gravar uma resposta nova é visível sem nova listagem', async () => {
    const { store, id } = await makeSession();
    const voice = new SessionVoiceStore(store, id);
    await voice.has(PATH); // aquece a listagem: ainda não existe

    await voice.put(PATH, new Uint8Array([1]));

    expect(await voice.has(PATH)).toBe(true);
  });

  it('apagar some da listagem guardada', async () => {
    const { store, id } = await makeSession();
    const voice = new SessionVoiceStore(store, id);
    await voice.put(PATH, new Uint8Array([1]));
    await voice.has(PATH);

    await voice.delete(PATH);

    expect(await voice.has(PATH)).toBe(false);
  });

  /**
   * O preparo pré-revisão pergunta por todos os caminhos com `Promise.all`. Guardar
   * só o resultado deixaria as ~396 chamadas partirem juntas antes de a primeira
   * voltar, e não teria economizado requisição nenhuma — é a PROMESSA que precisa
   * ser guardada.
   */
  it('consultas simultâneas dividem a mesma listagem', async () => {
    const { store, id } = await makeSession();
    const voice = new SessionVoiceStore(store, id);
    await voice.put(PATH, new Uint8Array([1]));
    let listings = 0;
    const original = store.listResources.bind(store);
    store.listResources = (sid, prefix) => {
      listings += 1;
      return original(sid, prefix);
    };

    await Promise.all([voice.has(PATH), voice.has(P2), voice.has(PATH)]);

    expect(listings).toBe(1);
  });
});
