import type { ReactNode } from 'react';

import './question-card.css';

/**
 * A pergunta do Conversation como cartão de conversa (redesign §6.6): a pergunta
 * na voz quieta (Merriweather), um marcador de papel opcional quando é conduzida
 * pela facilitadora ("nunca preencha por conta própria"), o botão "Ouvir a
 * pergunta" e um slot para a resposta (gravada em voz / observação da facilitadora).
 */
export function QuestionCard({
  question,
  facilitatorLed = false,
  onListen,
  listenLabel = 'Ouvir a pergunta',
  roleTitle = 'conduzida pela facilitadora',
  children,
}: {
  question: string;
  /** pergunta conduzida pela facilitadora — mostra o marcador de papel */
  facilitatorLed?: boolean;
  onListen?: () => void;
  listenLabel?: string;
  /** nome acessível do marcador de papel */
  roleTitle?: string;
  /** slot da resposta (gravação, forma de onda, observação) */
  children?: ReactNode;
}) {
  return (
    <div className="cds-question-card">
      {facilitatorLed ? (
        <span
          className="cds-question-card-role"
          role="img"
          aria-label={roleTitle}
          title={roleTitle}
        >
          <svg
            className="cds-question-card-role-glyph"
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
          </svg>
        </span>
      ) : null}
      <p className="cds-question-card-text">{question}</p>
      {onListen ? (
        <button type="button" className="cds-question-card-listen" onClick={onListen}>
          {listenLabel}
        </button>
      ) : null}
      {children ? <div className="cds-question-card-answer">{children}</div> : null}
    </div>
  );
}
