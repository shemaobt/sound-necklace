import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BeadRow } from './bead-row/bead-row';
import { ConfidenceTrio } from './confidence-trio/confidence-trio';
import { DocumentCard } from './document-card/document-card';
import { KindCard } from './kind-card/kind-card';
import { ProgressDots } from './progress-dots/progress-dots';
import { QuestionCard } from './question-card/question-card';
import { ScenePhraseChip } from './scene-phrase-chip/scene-phrase-chip';
import { SelectionBand } from './selection-band/selection-band';
import { StepperStation } from './stepper-station/stepper-station';
import { TrustChip } from './trust-chip/trust-chip';

const telha = { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' };

/**
 * Guarda de minimalismo para cultura oral (PRD v2 §9.2): com cópia digit-free,
 * nenhuma molécula apresenta contagens, números ou IDs — nem como texto visível,
 * nem como nome acessível (aria-label/title). Rótulos com números (ex.: "Cena 1")
 * são responsabilidade de quem chama; a molécula nunca injeta dígitos por conta.
 */
describe('moléculas não mostram dígitos ao ouvinte (PRD v2 §9.2)', () => {
  it('nenhuma molécula, com cópia digit-free, rende dígito algum', () => {
    const { container } = render(
      <>
        <BeadRow
          beads={[
            { key: 'a', state: 'lit', tint: telha },
            { key: 'b', state: 'head' },
          ]}
        />
        <SelectionBand tint={telha} rows={[{ key: 'r', beadCount: 2 }]} />
        <ScenePhraseChip label="Cena da fogueira" swatch={telha} />
        <ConfidenceTrio value="quase" />
        <KindCard label="Chegada a um lugar" tint={telha} />
        <KindCard label="Nenhum se encaixa" noneFit />
        <QuestionCard question="Sobre o que é essa história?" facilitatorLed onListen={() => {}}>
          <p>a resposta gravada</p>
        </QuestionCard>
        <DocumentCard
          filename="anchoring-return.json"
          title="As decisões de vocês"
          description="Onde cada cena e cada frase começa e termina."
        />
        <ol>
          <StepperStation label="Ouvir" state="current" />
        </ol>
        <ProgressDots count={4} current={1} />
        <TrustChip>Nada sai do seu navegador.</TrustChip>
      </>,
    );
    expect(container.textContent ?? '').not.toMatch(/\d/);
    for (const el of container.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
    }
    for (const el of container.querySelectorAll('[title]')) {
      expect(el.getAttribute('title')).not.toMatch(/\d/);
    }
  });
});
