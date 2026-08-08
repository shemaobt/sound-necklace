import { describe, expect, it } from 'vitest';

import { interviewIsEnglish, interviewLocale } from './interview-language';

/**
 * A língua da entrevista atravessa a fronteira do repo: o job de transcrição no
 * `tripod-api` exige o locale BCP-47 e decide por ele se chama o tradutor. Os dois
 * lados do SPA que dependem disso — o wiring e a revisão do relatório — leem daqui.
 */
describe('língua da entrevista', () => {
  it('traduz o idioma da UI para o locale que o job exige', () => {
    expect(interviewLocale('en')).toBe('en-US');
    expect(interviewLocale('en-GB')).toBe('en-US');
    expect(interviewLocale('pt')).toBe('pt-BR');
  });

  it('um idioma desconhecido cai em pt-BR, como o fallback do i18n', () => {
    expect(interviewLocale('fr')).toBe('pt-BR');
    expect(interviewIsEnglish('fr')).toBe(false);
  });

  it('só o inglês dispensa tradução', () => {
    expect(interviewIsEnglish('en')).toBe(true);
    expect(interviewIsEnglish('pt')).toBe(false);
  });
});
