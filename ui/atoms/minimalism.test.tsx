import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button/button';
import { Chip } from './chip/chip';
import { ConfidenceDisc } from './confidence-disc/confidence-disc';
import { CordLine } from './cord/cord';
import { Pearl } from './pearl/pearl';
import { PlayGlyph } from './play-glyph/play-glyph';
import { WaveformBar } from './waveform-bar/waveform-bar';

const telha = { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' };

/**
 * Guarda de minimalismo para cultura oral (PRD v2 §9.2): com props normais,
 * nenhum átomo apresenta contagens, números ou IDs — nem como texto visível,
 * nem como nome acessível.
 */
describe('átomos não mostram dígitos ao ouvinte (PRD v2 §9.2)', () => {
  it('nenhum átomo, com props normais, rende dígito algum', () => {
    const { container } = render(
      <>
        <Pearl />
        <Pearl state="lit" tint={telha} size={30} />
        <Pearl state="head" tint={telha} ping />
        <Pearl state="dim" sceneEnd />
        <CordLine />
        <Chip label="Cena da fogueira" swatch={telha} selected />
        <Chip label="Nenhum se encaixa" dashed />
        <Button>Confirmar a cena</Button>
        <Button variant="ghost" size="sm">
          Ouvir de novo
        </Button>
        <ConfidenceDisc variant="filled" label="Certeza" />
        <ConfidenceDisc variant="half" label="Quase" />
        <ConfidenceDisc variant="dashed" label="Na dúvida" />
        <WaveformBar height={34} active />
        <PlayGlyph state="play" />
        <PlayGlyph state="pause" />
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
