import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import './tutorial-popup.css';

/**
 * Popup de tutorial da facilitadora (PRD v2 §7.5): dicas curtas por estação,
 * ancoradas no canto inferior-direito (a AddonsLayer do shell), nunca sobre a
 * área de decisão do ouvinte. O Radix Popover contribui só comportamento
 * (âncora, ESC, clique-fora); o visual é 100% tokens Shemá. Sem Portal de
 * propósito: o conteúdo precisa renderizar DENTRO da camada de overlay do
 * shell, não em document.body.
 *
 * Dois níveis de dismiss: fechar (X/ESC/fora) esconde enquanto a sessão
 * estiver aberta (o popup desmonta sem sessão e volta a se oferecer noutra);
 * "não mostrar de novo" persiste em localStorage (chave no README). O gatilho
 * "?" permanece como rota de reencontro — dispensar nunca custa a informação.
 */

/** Estações com dica (a cópia vive no dicionário i18n — ENG-279). */
const STATIONS = ['listen', 'cut', 'triage', 'phrases', 'conversation', 'export'];

/** Chave do dismissal permanente (documentada no README deste organismo). */
const STORAGE_KEY = 'colar-de-sons:tutorial:dismissed:v1';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // storage bloqueado (ex.: Safari com cookies bloqueados) — mostrar a dica
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // sem storage o dismissal vale só pela sessão — nunca quebrar o app
  }
}

export interface TutorialPopupProps {
  /** Estação atual (diretório em ui/pages) — seleciona a dica exibida. */
  station: string;
}

export function TutorialPopup({ station }: TutorialPopupProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => !readDismissed());
  if (!STATIONS.includes(station)) return null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="cds-tutorial-popup-trigger"
        aria-label={t('tutorial.triggerAria')}
      >
        <span aria-hidden="true">?</span>
      </Popover.Trigger>
      <Popover.Content
        className="cds-tutorial-popup"
        aria-label={t('tutorial.contentAria')}
        side="top"
        align="end"
        sideOffset={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="cds-tutorial-popup-tip">{t(`tutorial.tips.${station}`)}</p>
        <button
          type="button"
          className="cds-tutorial-popup-never"
          onClick={() => {
            writeDismissed();
            setOpen(false);
          }}
        >
          {t('tutorial.never')}
        </button>
        <Popover.Close className="cds-tutorial-popup-close" aria-label={t('tutorial.close')}>
          <span aria-hidden="true">✕</span>
        </Popover.Close>
      </Popover.Content>
    </Popover.Root>
  );
}
