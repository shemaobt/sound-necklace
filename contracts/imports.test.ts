import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildBeads,
  createSession,
  type Frase,
  type ScenePart,
  type SessionState,
} from '../domain';

import { buildRetorno } from './retorno';
import { serializeArtifact } from './serialize';
import {
  applyDelivery,
  applyReturn,
  DeliverySchema,
  ReturnSchema,
  type Delivery,
  type ReturnImport,
} from './imports';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'imports');
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));

function session(overrides: Partial<SessionState> = {}): SessionState {
  const base = createSession({
    durationSec: 12,
    beadSec: 0.5,
    beads: buildBeads(12, 0.5), // 24 contas
    manifestId: 'fnv1a32:d31a8419',
    audioFilename: 'fluxo-minimo.wav',
    slug: 'fluxo-minimo',
  });
  return { ...base, ...overrides };
}

function part(overrides: Partial<ScenePart> & { part_id: string }): ScenePart {
  return {
    span: null,
    locked: false,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
    ...overrides,
  };
}

function frase(overrides: Partial<Frase> & { prop_id: string }): Frase {
  return {
    statement_pt: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    flagged: false,
    ...overrides,
  };
}

function noGridSession(): SessionState {
  return { ...session(), beads: [], totalBeads: 0 };
}

describe('applyDelivery — entrega vira propostas DESTRAVADAS', () => {
  const delivery: Delivery = {
    manifest_id: 'fnv1a32:d31a8419',
    scenes: [
      {
        scene_id: 'CENA-EXTERNA',
        parts: [
          {
            part_id: 'PT7',
            proposed_span: { start_bead: 0, end_bead: 9 },
            scene_kind: 'GLEANING_SCENE',
            scene_kind_confidence: 'alta',
            tag_state: 'tagged',
          },
          { proposed_span: { start_bead: 10, end_bead: 23 } }, // sem part_id → fallback
        ],
        propositions: [
          {
            prop_id: 'P9',
            statement_pt: 'A chegada ao campo.',
            qa_readback_pt: ['Quem chega?'],
            proposed_span: { start_bead: 0, end_bead: 4 },
            part_link: 'PT7',
          },
          { statement_pt: 'Sem span nem id.' }, // sem prop_id/span → fallback + span null
        ],
      },
    ],
  };

  it('sobrescreve whole.id, deixa cenas/frases destravadas com prefills e fallbacks PT#/P#', () => {
    const r = applyDelivery(session(), delivery);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.state.whole.id).toBe('CENA-EXTERNA');
    expect(r.state.parts).toEqual([
      part({
        part_id: 'PT7',
        span: { s: 0, e: 9 },
        scene_kind: 'GLEANING_SCENE',
        scene_kind_confidence: 'alta',
        tag_state: 'tagged',
      }),
      part({ part_id: 'PT2', span: { s: 10, e: 23 } }), // fallback PT+(idx+1), pending, destravada
    ]);
    expect(r.state.frases).toEqual([
      frase({
        prop_id: 'P9',
        statement_pt: 'A chegada ao campo.',
        qa: ['Quem chega?'],
        span: { s: 0, e: 4 },
        part_link: 'PT7',
      }),
      frase({ prop_id: 'P2', statement_pt: 'Sem span nem id.', span: null }), // fallback P+(idx+1)
    ]);
    // propostas: nada travado nem confirmado
    expect(r.state.parts.every((p) => !p.locked)).toBe(true);
    expect(r.state.frases.every((f) => !f.locked)).toBe(true);
    expect(r.state.whole.confirmed).toBe(false);
    expect(r.state.partsConfirmed).toBe(false);
  });

  it('não avisa mismatch quando manifest_id bate (ou está ausente)', () => {
    expect(applyDelivery(session(), delivery)).toMatchObject({ manifestMismatch: false });
    const semManifest: Delivery = { scenes: delivery.scenes };
    expect(applyDelivery(session(), semManifest)).toMatchObject({ manifestMismatch: false });
  });

  it('avisa mismatch quando o manifest_id da entrega diverge — mas ainda aplica', () => {
    const outro: Delivery = { ...delivery, manifest_id: 'fnv1a32:00000000' };
    const r = applyDelivery(session(), outro);
    expect(r).toMatchObject({ ok: true, manifestMismatch: true });
    if (r.ok) expect(r.state.parts).toHaveLength(2); // aplicou apesar do aviso
  });

  it('sem cena externa: não altera parts/frases mas ainda calcula o mismatch', () => {
    const vazia: Delivery = { manifest_id: 'fnv1a32:00000000', scenes: [] };
    const r = applyDelivery(session(), vazia);
    expect(r).toMatchObject({ ok: true, manifestMismatch: true });
    if (r.ok) {
      expect(r.state.parts).toEqual([]);
      expect(r.state.frases).toEqual([]);
    }
  });

  it('sem scene_id na entrega: preserva o whole.id atual e aplica os fallbacks vazios', () => {
    const semId: Delivery = { scenes: [{ parts: [{}], propositions: [{}] }] };
    const r = applyDelivery(session(), semId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.whole.id).toBe('S1'); // whole.id do domínio preservado
    expect(r.state.parts).toEqual([part({ part_id: 'PT1', span: null })]);
    expect(r.state.frases).toEqual([frase({ prop_id: 'P1', span: null })]);
  });

  it('rejeita quando a grade está ausente', () => {
    expect(applyDelivery(noGridSession(), delivery)).toEqual({ ok: false, reason: 'no-grid' });
  });
});

describe('applyReturn — retorno vira confirmações TRAVADAS', () => {
  const ret: ReturnImport = {
    manifest_id: 'fnv1a32:00000000', // diverge de propósito: retorno NÃO checa mismatch
    story_slug: 'fluxo-minimo',
    scenes: [
      {
        scene_id: 'S1',
        confirmed_span: { start_bead: 0, end_bead: 23 },
        parts: [
          {
            part_id: 'PT1',
            confirmed_span: { start_bead: 0, end_bead: 9 },
            scene_kind: 'GLEANING_SCENE',
            scene_kind_confidence: 'alta',
            tag_state: 'tagged',
          },
        ],
        propositions: [
          { prop_id: 'P1', confirmed_span: { start_bead: 0, end_bead: 4 }, part_link: 'PT1' },
          { prop_id: 'P2', confirmed_span: { start_bead: 5, end_bead: 9 }, part_link: 'PT1' },
        ],
      },
    ],
    flags: [{ kind: 'NEEDS_REVIEW', prop_id: 'P2', note_pt: '' }],
  };

  it('trava colar/cenas/frases, marca partsConfirmed e reaplica flags por prop_id', () => {
    const r = applyReturn(session(), ret);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.state.whole).toEqual({ id: 'S1', span: { s: 0, e: 23 }, confirmed: true });
    expect(r.state.parts).toEqual([
      part({
        part_id: 'PT1',
        span: { s: 0, e: 9 },
        locked: true,
        scene_kind: 'GLEANING_SCENE',
        scene_kind_confidence: 'alta',
        tag_state: 'tagged',
      }),
    ]);
    expect(r.state.partsConfirmed).toBe(true);
    expect(r.state.frases).toEqual([
      frase({ prop_id: 'P1', span: { s: 0, e: 4 }, part_link: 'PT1', locked: true }),
      frase({ prop_id: 'P2', span: { s: 5, e: 9 }, part_link: 'PT1', locked: true, flagged: true }),
    ]);
    expect(r.state.current).toEqual({ layer: 'frases', index: -1 });
    expect(r.state.selection).toBeNull();
  });

  it('nunca avisa mismatch, mesmo com manifest_id divergente', () => {
    expect(applyReturn(session(), ret)).toMatchObject({ manifestMismatch: false });
  });

  it('cena sem parts: não LIGA partsConfirmed (fica como estava)', () => {
    const semParts: ReturnImport = {
      scenes: [{ scene_id: 'S1', confirmed_span: { start_bead: 0, end_bead: 23 }, parts: [] }],
    };
    const r = applyReturn(session(), semParts);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.state.partsConfirmed).toBe(false);
  });

  it('cena sem parts: NUNCA desliga um partsConfirmed já verdadeiro', () => {
    const semParts: ReturnImport = {
      scenes: [{ scene_id: 'S1', confirmed_span: { start_bead: 0, end_bead: 23 }, parts: [] }],
    };
    const r = applyReturn(session({ partsConfirmed: true }), semParts);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.state.partsConfirmed).toBe(true);
  });

  it('sem cena confirmada: pula o bloco mas reaplica flags e move o cursor (ref L1368/L1378)', () => {
    // frases já no estado; retorno só com flags, sem cena → o bloco da cena é
    // pulado, mas as flags pousam e o cursor vai a frases
    const soFlags: ReturnImport = { flags: [{ kind: 'NEEDS_REVIEW', prop_id: 'P1', note_pt: '' }] };
    const seeded = session({
      frases: [frase({ prop_id: 'P1', span: { s: 0, e: 4 }, part_link: 'PT1', locked: true })],
      current: { layer: 'whole', index: -1 },
      selection: { s: 1, e: 2 },
    });
    const r = applyReturn(seeded, soFlags);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.frases[0]?.flagged).toBe(true); // flag reaplicada sem cena
    expect(r.state.frases[0]?.span).toEqual({ s: 0, e: 4 }); // frase preservada
    expect(r.state.current).toEqual({ layer: 'frases', index: -1 });
    expect(r.state.selection).toBeNull();
  });

  it('aplica os fallbacks quando campos opcionais faltam (scene_id, part_id, tipo, part_link)', () => {
    const magro: ReturnImport = {
      scenes: [
        {
          confirmed_span: { start_bead: 0, end_bead: 23 },
          parts: [{ confirmed_span: { start_bead: 0, end_bead: 9 } }],
          propositions: [{ prop_id: 'P1', confirmed_span: { start_bead: 0, end_bead: 4 } }],
        },
      ],
    };
    const r = applyReturn(session(), magro);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.whole.id).toBe('S1'); // scene_id ausente → 'S1'
    expect(r.state.parts).toEqual([
      part({ part_id: 'PT1', span: { s: 0, e: 9 }, locked: true }), // pending, sem tipo
    ]);
    expect(r.state.frases).toEqual([
      frase({ prop_id: 'P1', span: { s: 0, e: 4 }, part_link: null, locked: true }),
    ]);
  });

  it('rejeita quando a grade está ausente', () => {
    expect(applyReturn(noGridSession(), ret)).toEqual({ ok: false, reason: 'no-grid' });
  });
});

describe('fidelidade import→export: retorno → import → export é byte-idêntico', () => {
  it('reproduz o retorno-ancoragem.json byte a byte após semear pela via de retorno', () => {
    // fonte: sessão já travada cujos mappers reais produzem o retorno "de origem"
    const source = session({
      whole: { id: 'S1', span: { s: 0, e: 23 }, confirmed: true },
      parts: [
        part({
          part_id: 'PT1',
          span: { s: 0, e: 9 },
          locked: true,
          scene_kind: 'GLEANING_SCENE',
          scene_kind_confidence: 'alta',
          tag_state: 'tagged',
        }),
        part({ part_id: 'PT2', span: { s: 10, e: 23 }, locked: true, tag_state: 'none_fit' }),
      ],
      partsConfirmed: true,
      frases: [
        frase({
          prop_id: 'P1',
          span: { s: 0, e: 4 },
          part_link: 'PT1',
          locked: true,
          flagged: true,
        }),
        frase({ prop_id: 'P2', span: { s: 5, e: 9 }, part_link: 'PT1', locked: true }),
      ],
    });
    const seedBytes = serializeArtifact(buildRetorno(source));

    // semeia uma sessão FRESCA (mesma grade/slug/manifest) pela via de retorno
    const seed = ReturnSchema.parse(JSON.parse(seedBytes));
    const r = applyReturn(session(), seed);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(serializeArtifact(buildRetorno(r.state))).toBe(seedBytes);
  });
});

describe('imports — fixtures válidas/inválidas', () => {
  it('aceita as entregas/retornos válidos', () => {
    expect(() => DeliverySchema.parse(fixture('delivery-valid.json'))).not.toThrow();
    expect(() => ReturnSchema.parse(fixture('return-valid.json'))).not.toThrow();
  });

  it('rejeita entrega com confiança fora do enum', () => {
    expect(() => DeliverySchema.parse(fixture('delivery-invalid-confidence.json'))).toThrow();
  });

  it('rejeita entrega com bead não-inteiro', () => {
    expect(() => DeliverySchema.parse(fixture('delivery-invalid-span.json'))).toThrow();
  });

  it('rejeita retorno sem confirmed_span na parte', () => {
    expect(() => ReturnSchema.parse(fixture('return-invalid-missing-span.json'))).toThrow();
  });
});
