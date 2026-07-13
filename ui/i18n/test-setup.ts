import { afterEach } from 'vitest';

import i18n from './index';

/**
 * Setup dos projetos de UI (dom + browser) no Vitest (ENG-279): importar este módulo
 * inicializa o i18n (default PT) para TODO teste de UI — sem isto, `t()` devolveria a
 * chave crua e as asserções de cópia PT-BR existentes quebrariam. O `afterEach` isola
 * o idioma entre casos: um teste que troca para EN não vaza para o próximo.
 */
afterEach(async () => {
  await i18n.changeLanguage('pt');
});
