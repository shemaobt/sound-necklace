import { useRef } from 'react';

import { ConfidenceDisc } from '../../atoms';
import './confidence-trio.css';

/** Token presentacional da escolha; a página mapeia para alta/média/baixa. */
export type ConfidenceChoice = 'certeza' | 'quase' | 'duvida';

const CHOICES: {
  choice: ConfidenceChoice;
  variant: 'filled' | 'half' | 'dashed';
}[] = [
  { choice: 'certeza', variant: 'filled' },
  { choice: 'quase', variant: 'half' },
  { choice: 'duvida', variant: 'dashed' },
];

/** Cópia PT-BR default: molécula é presentacional — o organismo passa o texto traduzido. */
const DEFAULT_CHOICE_LABELS: Record<ConfidenceChoice, string> = {
  certeza: 'Certeza',
  quase: 'Quase',
  duvida: 'Na dúvida',
};

/**
 * O segundo gesto da Triagem (redesign §4.4, §6.4): confiança em três formas —
 * disco cheio / meio / tracejado — não em texto. Grupo de rádio de escolha única
 * (APG): uma parada de tab, setas movem e selecionam (roving tabindex).
 */
export function ConfidenceTrio({
  value,
  onSelect,
  label = 'O quanto isso parece certo pra você?',
  choiceLabels = DEFAULT_CHOICE_LABELS,
}: {
  value?: ConfidenceChoice;
  onSelect?: (choice: ConfidenceChoice) => void;
  label?: string;
  choiceLabels?: Record<ConfidenceChoice, string>;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = CHOICES.findIndex((c) => c.choice === value);
  const tabbableIndex = activeIndex >= 0 ? activeIndex : 0;

  const move = (from: number, delta: number) => {
    const next = (from + delta + CHOICES.length) % CHOICES.length;
    const choice = CHOICES[next]?.choice;
    if (!choice) return;
    onSelect?.(choice);
    refs.current[next]?.focus();
  };

  return (
    <div className="cds-confidence-trio" role="radiogroup" aria-label={label}>
      {CHOICES.map((c, i) => (
        <button
          key={c.choice}
          type="button"
          role="radio"
          aria-checked={c.choice === value}
          tabIndex={i === tabbableIndex ? 0 : -1}
          data-choice={c.choice}
          className="cds-confidence-trio-card"
          ref={(el) => {
            refs.current[i] = el;
          }}
          onClick={() => onSelect?.(c.choice)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              move(i, 1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              move(i, -1);
            } else if (e.key === 'Home') {
              e.preventDefault();
              move(-1, 1);
            } else if (e.key === 'End') {
              e.preventDefault();
              move(0, -1);
            }
          }}
        >
          <ConfidenceDisc variant={c.variant} size={64} />
          <span className="cds-confidence-trio-label">{choiceLabels[c.choice]}</span>
        </button>
      ))}
    </div>
  );
}
