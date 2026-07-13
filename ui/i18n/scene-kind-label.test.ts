import { describe, expect, it } from 'vitest';

import { sceneKindLabel } from './scene-kind-label';

/**
 * Rótulo de `scene_kind` por idioma (ENG-279). O VALOR inglês é o contrato com o
 * Compilador e nunca muda — só o rótulo EXIBIDO acompanha a UI. O `domain/` fica
 * intocado: PT vem do `skShort` e EN do `skEnShort` (o mesmo inglês que o relatório
 * usa), então o golden segue byte-idêntico.
 */
describe('sceneKindLabel (ENG-279)', () => {
  it('exibe o rótulo PT-BR quando a UI está em pt', () => {
    expect(sceneKindLabel('GLEANING_SCENE', 'pt')).toBe('Respiga');
    expect(sceneKindLabel('BIRTH_SCENE', 'pt')).toBe('Nascimento');
  });

  it('exibe o inglês canônico quando a UI está em en', () => {
    expect(sceneKindLabel('GLEANING_SCENE', 'en')).toBe('Gleaning');
    expect(sceneKindLabel('BIRTH_SCENE', 'en')).toBe('Birth');
  });

  it('um tipo sem rótulo PT nunca some da tela — cai no inglês nos dois idiomas', () => {
    expect(sceneKindLabel('UNKNOWN_KIND_SCENE', 'pt')).toBe('Unknown kind');
    expect(sceneKindLabel('UNKNOWN_KIND_SCENE', 'en')).toBe('Unknown kind');
  });
});
