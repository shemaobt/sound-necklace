import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';

import './conversation-mode-picker.css';

/**
 * Como a conversa anda (ENG-649, protótipo v4 linhas 714-737).
 *
 * `auto` — "Mãos livres": a pergunta fala ao chegar, o microfone abre quando ela
 * acaba de ser falada, e a próxima pergunta entra sozinha depois da gravação.
 * `manual` — "Toque a toque": nada acontece sem um toque.
 *
 * É decisão de acessibilidade, não preferência: quem não lê e não quer administrar
 * uma tela precisa atravessar a entrevista sem procurar controle nenhum. Por isso a
 * escolha é feita ANTES, pela dupla, e por isso a volta ao modo quieto tem de estar
 * alcançável o tempo todo (a pílula do cabeçalho).
 */
export type ConversationMode = 'auto' | 'manual';

export interface ConversationModePickerProps {
  onChoose: (mode: ConversationMode) => void;
}

/** Ondas de som saindo dos dois lados — o ícone do "Mãos livres" (protótipo v4). */
function HandsFreeGlyph({ size = 21 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="M7 8a6 6 0 0 1 10 0" />
      <path d="M7 16a6 6 0 0 0 10 0" />
    </svg>
  );
}

/** A mão que toca — o ícone do "Toque a toque" (protótipo v4). */
function TouchGlyph({ size = 21 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 11.5V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M15 12v-1a1.5 1.5 0 0 1 3 0v3a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3l-2-3.5a1.4 1.4 0 0 1 2.3-1.5L8 14V6" />
    </svg>
  );
}

/** O ícone de cada modo, no tamanho pedido — reusado pela pílula do cabeçalho. */
export function ConversationModeGlyph({ mode, size }: { mode: ConversationMode; size?: number }) {
  return mode === 'auto' ? <HandsFreeGlyph size={size} /> : <TouchGlyph size={size} />;
}

/**
 * O pedido do modo, na chegada à conversa: dois cartões lado a lado, e clicar um
 * DELES é a confirmação — não existe botão de confirmar. Não há saída sem escolher,
 * de propósito: a pergunta atrás dele ainda não pertence a modo nenhum.
 *
 * Apresentacional: só sabe dizer os dois caminhos e avisar qual foi tomado.
 */
export function ConversationModePicker({ onChoose }: ConversationModePickerProps) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="cds-mode-picker-overlay" />
        <Dialog.Content
          className="cds-mode-picker"
          // clicar fora e Esc não decidem nada: o modo é uma escolha da dupla,
          // e sair sem ela deixaria a entrevista sem regra de andamento
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <p className="cds-mode-picker-eyebrow">{t('conversationMode.eyebrow')}</p>
          <Dialog.Title className="cds-mode-picker-title">
            {t('conversationMode.title')}
          </Dialog.Title>
          <Dialog.Description className="cds-mode-picker-sr-only">
            {t('conversationMode.footer')}
          </Dialog.Description>

          <div className="cds-mode-picker-cards">
            <button
              type="button"
              className="cds-mode-picker-card"
              data-mode="auto"
              onClick={() => onChoose('auto')}
            >
              <span className="cds-mode-picker-card-head">
                <span className="cds-mode-picker-icon" aria-hidden="true">
                  <HandsFreeGlyph />
                </span>
                <span className="cds-mode-picker-card-title">
                  {t('conversationMode.handsFree')}
                </span>
              </span>
              <span className="cds-mode-picker-card-body">
                {t('conversationMode.handsFreeDescription')}
              </span>
              <span className="cds-mode-picker-card-tag">{t('conversationMode.handsFreeTag')}</span>
            </button>

            <button
              type="button"
              className="cds-mode-picker-card"
              data-mode="manual"
              onClick={() => onChoose('manual')}
            >
              <span className="cds-mode-picker-card-head">
                <span className="cds-mode-picker-icon" aria-hidden="true">
                  <TouchGlyph />
                </span>
                <span className="cds-mode-picker-card-title">
                  {t('conversationMode.touchByTouch')}
                </span>
              </span>
              <span className="cds-mode-picker-card-body">
                {t('conversationMode.touchByTouchDescription')}
              </span>
              <span className="cds-mode-picker-card-tag">
                {t('conversationMode.touchByTouchTag')}
              </span>
            </button>
          </div>

          <p className="cds-mode-picker-footer">{t('conversationMode.footer')}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
