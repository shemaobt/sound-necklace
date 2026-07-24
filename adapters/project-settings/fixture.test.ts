import { describe, expect, it } from 'vitest';

import { FixtureProjectSettings } from './fixture';
import registration from './register';
import { GranularityLockedError } from './types';

/**
 * A fixture existe para o app rodar sem API, e só vale se reproduzir as regras que a
 * tela exercita — não é um Map com getters. As duas que importam: o nível congela
 * quando o projeto corta algo, e reenviar o nível que já está lá é no-op.
 */

const NOW = () => '2026-07-24T00:00:00.000Z';

describe('FixtureProjectSettings', () => {
  it('projeto que ninguém configurou lê como não decidido', async () => {
    const store = new FixtureProjectSettings({ now: NOW });

    await expect(store.get('proj-1')).resolves.toEqual({
      project_id: 'proj-1',
      granularity_level: null,
      bead_sec: null,
      locked: false,
      updated_at: null,
    });
  });

  it('grava o nível e o devolve na leitura seguinte', async () => {
    const store = new FixtureProjectSettings({ now: NOW });

    await store.setLevel('proj-1', 'small');

    const settings = await store.get('proj-1');
    expect(settings.granularity_level).toBe('small');
    expect(settings.updated_at).toBe(NOW());
    // O nível não resolve a grade: isso é o acousteme do áudio, na primeira sessão.
    expect(settings.bead_sec).toBeNull();
  });

  it('troca o nível enquanto nada foi cortado', async () => {
    const store = new FixtureProjectSettings({ now: NOW });
    await store.setLevel('proj-1', 'small');

    await expect(store.setLevel('proj-1', 'large')).resolves.toMatchObject({
      granularity_level: 'large',
    });
  });

  it('congela o nível depois que o projeto cortou alguma coisa', async () => {
    const store = new FixtureProjectSettings({ now: NOW });
    await store.setLevel('proj-1', 'medium');
    store.noteSessionCreated('proj-1', 'medium', 0.5);

    await expect(store.setLevel('proj-1', 'small')).rejects.toBeInstanceOf(GranularityLockedError);
    await expect(store.get('proj-1')).resolves.toMatchObject({
      granularity_level: 'medium',
      bead_sec: 0.5,
      locked: true,
    });
  });

  it('reenviar o nível que já está lá não é conflito', async () => {
    const store = new FixtureProjectSettings({ now: NOW });
    await store.setLevel('proj-1', 'medium');
    store.noteSessionCreated('proj-1', 'medium', 0.5);

    await expect(store.setLevel('proj-1', 'medium')).resolves.toMatchObject({ locked: true });
  });

  it('cortar um projeto sem configuração carimba nível E grade', async () => {
    const store = new FixtureProjectSettings({ now: NOW });

    store.noteSessionCreated('proj-1', 'large', 1);

    await expect(store.get('proj-1')).resolves.toMatchObject({
      granularity_level: 'large',
      bead_sec: 1,
      locked: true,
    });
  });

  it('cortar de novo não move a grade já carimbada', async () => {
    const store = new FixtureProjectSettings({ now: NOW });
    store.noteSessionCreated('proj-1', 'medium', 0.5);

    store.noteSessionCreated('proj-1', 'medium', 0.25);

    await expect(store.get('proj-1')).resolves.toMatchObject({ bead_sec: 0.5 });
  });

  it('projetos não se contaminam', async () => {
    const store = new FixtureProjectSettings({ now: NOW });
    await store.setLevel('proj-1', 'small');
    store.noteSessionCreated('proj-1', 'small', 0.2);

    await expect(store.get('proj-2')).resolves.toMatchObject({
      granularity_level: null,
      locked: false,
    });
    await expect(store.setLevel('proj-2', 'large')).resolves.toMatchObject({
      granularity_level: 'large',
    });
  });

  it('a semente do registro abre o projeto do modo fixture já decidido', async () => {
    const settings = await registration.fixture().get('projeto');

    expect(settings.granularity_level).toBe('medium');
    expect(settings.locked).toBe(false);
  });
});
