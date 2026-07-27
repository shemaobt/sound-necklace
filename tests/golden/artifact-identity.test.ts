import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildManifesto,
  buildMapReport,
  buildRetorno,
  manifestoFilename,
  retornoFilename,
  relatorioFilename,
} from '../../contracts';
import { replaySessionSteps, type GoldenCase } from './registry';

/**
 * O identificador que liga os três artefatos entre si e à cadeia do áudio (ENG-346).
 *
 * `manifest_id` já aparece nos três — mas "aparece" é uma observação, não uma
 * garantia. O golden prova os BYTES de cada artefato contra a referência, o que
 * pegaria a queda do campo; o que ele não afirma é a INVARIANTE, que é o que um
 * consumidor a jusante (o Compilador, o dado de treino) depende para juntar
 * áudio ↔ artefatos sem abrir os arquivos. Este arquivo a afirma, e a afirma sobre
 * cada cenário roteirizado do harness em vez de sobre um estado inventado — assim um
 * caso novo entra coberto de graça.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const casesDir = join(__dirname, 'cases');

const cases: GoldenCase[] = readdirSync(casesDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(casesDir, f), 'utf8')) as GoldenCase);

/** O `manifest:` da linha de contexto do relatório (§10.4), como o .md o carrega. */
function manifestFromReport(md: string): string | null {
  return /manifest: `([^`]*)`/.exec(md)?.[1] ?? null;
}

/** O slug do título do relatório (`# Meaning Mapping Report — <slug>`). */
function slugFromReport(md: string): string | null {
  return /^# Meaning Mapping Report — (.*)$/m.exec(md)?.[1] ?? null;
}

describe('identidade dos artefatos — o elo que o Compilador segue (§10, ENG-346)', () => {
  it('há cenários para valer o teste', () => {
    expect(cases.length).toBeGreaterThanOrEqual(3);
  });

  for (const c of cases) {
    it(`${c.name}: os três artefatos carregam o MESMO manifest_id`, () => {
      const { state } = replaySessionSteps(c.steps);
      // sem grade não há artefato a comparar (o caso é de outra coisa)
      if (state.totalBeads === 0) return;

      const manifesto = buildManifesto(state);
      const retorno = buildRetorno(state);
      const report = buildMapReport(state);

      expect(manifesto.manifest_id).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
      expect(retorno.manifest_id).toBe(manifesto.manifest_id);
      expect(manifestFromReport(report)).toBe(manifesto.manifest_id);
    });

    it(`${c.name}: o slug é o mesmo no retorno, no relatório e nos três nomes de arquivo`, () => {
      const { state } = replaySessionSteps(c.steps);
      if (state.totalBeads === 0) return;

      const slug = buildRetorno(state).story_slug;
      // O slug CRU é o do retorno; o relatório e os nomes de arquivo caem no mesmo
      // fallback quando ele é vazio (ENG-359 unificou os três em "story").
      const expected = slug || 'story';

      expect(slugFromReport(buildMapReport(state))).toBe(expected);
      for (const filename of [
        manifestoFilename(slug),
        retornoFilename(slug),
        relatorioFilename(slug),
      ]) {
        expect(filename.startsWith(`${expected}-`), filename).toBe(true);
      }
    });
  }

  /**
   * O elo tem de ser o hash DA GRADE, não um id de sessão: é ele que amarra os
   * artefatos ao áudio e ao `bead_duration_sec` em que foram cortados. Duas grades
   * diferentes sobre o mesmo áudio precisam produzir elos diferentes, ou o consumidor
   * juntaria material cortado em sistemas de coordenadas distintos.
   */
  it('grades diferentes produzem elos diferentes', () => {
    const grids = cases
      .map((c) => replaySessionSteps(c.steps).state)
      .filter((s) => s.totalBeads > 0)
      .map((s) => ({
        id: buildManifesto(s).manifest_id,
        beadSec: s.beadSec,
        file: s.audioFilename,
      }));

    for (const a of grids) {
      for (const b of grids) {
        if (a.file !== b.file || a.beadSec === b.beadSec) continue;
        expect(a.id, `${a.file} @${a.beadSec} vs @${b.beadSec}`).not.toBe(b.id);
      }
    }
  });

  /**
   * O nome de arquivo não é o elo, e não pode virar um. Ele mudou de idioma na
   * ENG-359 sem que nada a jusante quebrasse porque o elo vive DENTRO dos bytes —
   * este teste é o que mantém essa propriedade verdadeira.
   */
  it('o manifest_id não depende do nome do arquivo do artefato', () => {
    const { state } = replaySessionSteps(cases[0]!.steps);
    if (state.totalBeads === 0) return;

    const id = buildManifesto(state).manifest_id;
    expect(manifestoFilename(state.slug)).not.toContain(id);
    expect(buildManifesto({ ...state, slug: 'outro-nome-qualquer' }).manifest_id).toBe(id);
  });
});
