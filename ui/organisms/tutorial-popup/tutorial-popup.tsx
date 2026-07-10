import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';

import './tutorial-popup.css';

/**
 * Popup de tutorial da facilitadora (PRD v2 §7.5): dicas curtas por estação,
 * ancoradas no canto inferior-direito (a AddonsLayer do shell), nunca sobre a
 * área de decisão do ouvinte. O Radix Popover contribui só comportamento
 * (âncora, ESC, clique-fora); o visual é 100% tokens Shemá. Sem Portal de
 * propósito: o conteúdo precisa renderizar DENTRO da camada de overlay do
 * shell, não em document.body.
 *
 * Dois níveis de dismiss: fechar (X/ESC/fora) esconde pela sessão; "não
 * mostrar de novo" persiste em localStorage (chave no README). O gatilho "?"
 * permanece como rota de reencontro — dispensar nunca custa a informação.
 */

const TIPS: Record<string, string> = {
  escuta1:
    'Ouçam a história inteira, sem pressa. O botão grande toca e pausa; confirme quando a história tiver sido ouvida por completo.',
  escuta2:
    'Toque uma conta para ouvir dali. Marquem juntos onde cada cena termina e confirme uma cena de cada vez.',
  triagem:
    'Classifiquem cada cena ouvindo-a de novo. Quando nenhum tipo se encaixa, «nenhum se encaixa» também é um achado.',
  segmentacao:
    'Dentro de cada cena, marquem as frases: um toque onde começa, outro onde termina. Se a frase passar da borda, o colar oferece caminhos.',
  mapeamento:
    'Faça as perguntas em voz alta e grave as respostas de quem conta. Você pode escrever depois — nunca pelo ouvinte.',
  export: 'A história está inteira no colar. Guarde a sessão para gerar os documentos do projeto.',
};

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
  const [open, setOpen] = useState(() => !readDismissed());
  const tip = TIPS[station];
  if (!tip) return null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="cds-tutorial-popup-trigger" aria-label="Como funciona esta etapa">
        <span aria-hidden="true">?</span>
      </Popover.Trigger>
      <Popover.Content
        className="cds-tutorial-popup"
        side="top"
        align="end"
        sideOffset={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="cds-tutorial-popup-tip">{tip}</p>
        <button
          type="button"
          className="cds-tutorial-popup-never"
          onClick={() => {
            writeDismissed();
            setOpen(false);
          }}
        >
          Não mostrar de novo
        </button>
        <Popover.Close className="cds-tutorial-popup-close" aria-label="Fechar dica">
          <span aria-hidden="true">✕</span>
        </Popover.Close>
      </Popover.Content>
    </Popover.Root>
  );
}
