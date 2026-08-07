import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { NavFooterOutlet, NavFooterProvider } from './nav-footer';

/**
 * Rende uma estação com o shell mínimo de que o rodapé de navegação precisa: o
 * provedor e a saída. Uma estação publica a sua navegação por `StationNav`, que
 * não desenha nada onde é chamado — sem este embrulho, "Confirmar as cenas" e
 * companhia simplesmente não existem no DOM do teste.
 *
 * Importado só por *.test.tsx (precedente: ui/atoms/testing/css.ts).
 */
export function renderStation(ui: ReactElement): ReturnType<typeof render> {
  return render(
    <NavFooterProvider>
      {ui}
      <NavFooterOutlet />
    </NavFooterProvider>,
  );
}
