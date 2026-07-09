import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { replayers, STRICT, type GoldenCase } from './registry';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * O portão de merge (CLAUDE.md): reproduz cada caso através de domain/contracts
 * e compara BYTE A BYTE com os goldens gerados da referência (generate.mjs).
 * Caso sem replayer → PENDENTE: passa com aviso até a ENG-238 (STRICT).
 */
const casesDir = join(__dirname, 'cases');
const expectedDir = join(__dirname, 'expected');

const cases: GoldenCase[] = readdirSync(casesDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(casesDir, f), 'utf8')) as GoldenCase);

describe('golden harness', () => {
  it('tem casos definidos e goldens comitados para todos', () => {
    expect(cases.length).toBeGreaterThanOrEqual(3);
    for (const c of cases) {
      const files = readdirSync(join(expectedDir, c.name));
      expect(
        files.length,
        `caso ${c.name} sem goldens — rode pnpm golden:generate`,
      ).toBeGreaterThan(0);
    }
  });

  for (const c of cases) {
    const replay = replayers[c.name];
    if (!replay) {
      const title = `${c.name} — PENDENTE (sem replayer de domínio; habilitado pelas issues E1)`;
      if (STRICT) {
        it(title, () => {
          expect.fail(`modo ESTRITO: o caso ${c.name} não tem replayer registrado`);
        });
      } else {
        it(title, () => {
          console.warn(`⚠️  golden PENDENTE: ${c.name} aguarda seu replayer (registry.ts)`);
          expect(replay).toBeUndefined();
        });
      }
      continue;
    }

    it(`${c.name} — byte-idêntico à referência`, () => {
      const produced = replay(c.steps);
      const goldenFiles = readdirSync(join(expectedDir, c.name)).sort();
      expect(Object.keys(produced).sort()).toEqual(goldenFiles);
      for (const file of goldenFiles) {
        const golden = readFileSync(join(expectedDir, c.name, file));
        const ours = Buffer.from(produced[file] ?? '', 'utf8');
        expect(ours.equals(golden), `${c.name}/${file}: bytes divergem do golden`).toBe(true);
      }
    });
  }
});
