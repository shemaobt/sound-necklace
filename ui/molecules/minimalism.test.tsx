import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BeadRow } from './bead-row/bead-row';
import { BeadStrip } from './bead-strip/bead-strip';
import { ConfidenceTrio } from './confidence-trio/confidence-trio';
import { DocumentCard } from './document-card/document-card';
import { KindCard } from './kind-card/kind-card';
import { QuestionCard } from './question-card/question-card';
import { SelectionBand } from './selection-band/selection-band';
import { StoryProgressBar } from './story-progress-bar/story-progress-bar';
import { TrustChip } from './trust-chip/trust-chip';

const telha = { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' };

/**
 * Guarda de minimalismo para cultura oral (PRD v2 §9.2): com cópia digit-free,
 * nenhuma molécula apresenta contagens, números ou IDs — nem como texto visível,
 * nem como nome acessível (aria-label/title). Rótulos com números (ex.: "Cena 1")
 * são responsabilidade de quem chama; a molécula nunca injeta dígitos por conta.
 *
 * EXCEÇÃO ÚNICA — `ProgressDots` (ENG-389, decisão do dono, 2026-08-04). O
 * indicador de cena da Triagem usa o MESMO elemento visual da conta do colar, e
 * na validação isso fez o usuário lê-lo como "uma conta": não dava para saber em
 * que cena estava nem quais faltavam. Ali o número passou a ser identidade, não
 * contagem. A exceção vale para esse indicador e para mais nada — o número segue
 * proibido nas contas do colar, no fio do rodapé e em toda outra molécula, e é
 * por isso que `ProgressDots` sai desta composição em vez de a guarda inteira
 * ser afrouxada. O comportamento numerado tem teste próprio em
 * `progress-dots/progress-dots.test.tsx`.
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
        <BeadStrip
          items={[
            { key: 'a', label: 'Cena da fogueira', swatch: telha },
            { key: 'b', label: 'Cena do rio', swatch: telha },
          ]}
          selected="b"
          groupLabel="cenas costuradas"
        />
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
        <StoryProgressBar percent={37} dividers={[8, 22, 34, 60, 92]} />
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
