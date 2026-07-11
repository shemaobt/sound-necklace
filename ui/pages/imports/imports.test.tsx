import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildBeads, createSession, type SessionState } from '../../../domain';
import { sessionStore } from '../../state';
import Imports from './index';

/**
 * Estação de interoperabilidade com o pipeline (§8.9): as duas portas — carregar
 * uma ENTREGA (propostas destravadas, "confirme de ouvido") e retomar um RETORNO
 * (confirmações travadas, flags reaplicadas). A página só seleciona o arquivo,
 * exibe erro e substitui o estado; todo o mapeamento vem de contracts/imports.ts.
 * Os testes dirigem a página por upload de arquivo real e afirmam o estado
 * resultante no sessionStore + as cópias verbatim da referência.
 */

const BEAD_SEC = 0.25;
const DURATION = 2.5; // 10 contas (0…9)
const MANIFEST = 'fnv1a32:00000000';

function fresh(over: Partial<SessionState> = {}): SessionState {
  const beads = buildBeads(DURATION, BEAD_SEC);
  return {
    ...createSession({
      durationSec: DURATION,
      beadSec: BEAD_SEC,
      beads,
      manifestId: MANIFEST,
      audioFilename: 'historia.wav',
      slug: 'historia',
    }),
    ...over,
  };
}

function fileOf(obj: unknown): File {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return new File([text], 'pipeline.json', { type: 'application/json' });
}

async function uploadTo(label: RegExp, obj: unknown): Promise<void> {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  await userEvent.upload(input, fileOf(obj));
}

const DELIVERY = {
  manifest_id: MANIFEST,
  scenes: [
    {
      scene_id: 'S9',
      parts: [
        {
          proposed_span: { start_bead: 0, end_bead: 4 },
          scene_kind: 'APPEAL_SCENE',
          scene_kind_confidence: 'alta',
          tag_state: 'tagged',
        },
      ],
      propositions: [
        {
          prop_id: 'P1',
          statement_pt: 'ele partiu ao amanhecer',
          qa_readback_pt: ['quem partiu?'],
          proposed_span: { start_bead: 1, end_bead: 3 },
        },
      ],
    },
  ],
};

const RETURN = {
  manifest_id: 'fnv1a32:deadbeef', // presente e divergente — retorno NÃO avisa
  scenes: [
    {
      scene_id: 'S1',
      confirmed_span: { start_bead: 0, end_bead: 9 },
      parts: [
        {
          confirmed_span: { start_bead: 0, end_bead: 4 },
          scene_kind: 'APPEAL_SCENE',
          scene_kind_confidence: 'alta',
          tag_state: 'tagged',
        },
      ],
      propositions: [{ prop_id: 'P1', confirmed_span: { start_bead: 0, end_bead: 2 } }],
    },
  ],
  flags: [{ kind: 'NEEDS_REVIEW', prop_id: 'P1', note_pt: 'rever este trecho' }],
};

const MISMATCH_MSG = /o manifest_id da entrega não bate com o do áudio/;

function reset(): void {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
}
beforeEach(reset);
afterEach(reset);

describe('estação imports — entrega', () => {
  it('carrega propostas DESTRAVADAS com os prefills no store', async () => {
    sessionStore.getState().load(fresh());
    render(<Imports />);

    await uploadTo(/entrega/i, DELIVERY);
    await screen.findByText(/Entrega carregada: 1 cena\(s\), 1 frase\(s\)/);

    const s = sessionStore.getState().session!;
    expect(s.parts).toHaveLength(1);
    expect(s.parts[0]!.locked).toBe(false);
    expect(s.parts[0]!.scene_kind).toBe('APPEAL_SCENE');
    expect(s.parts[0]!.tag_state).toBe('tagged');
    expect(s.frases[0]!.statement_pt).toBe('ele partiu ao amanhecer');
    expect(s.frases[0]!.locked).toBe(false);
  });

  it('avisa mismatch de manifesto e AINDA carrega a entrega', async () => {
    sessionStore.getState().load(fresh());
    render(<Imports />);

    await uploadTo(/entrega/i, { ...DELIVERY, manifest_id: 'fnv1a32:deadbeef' });

    expect(await screen.findByText(MISMATCH_MSG)).toBeTruthy();
    await screen.findByText(/Entrega carregada: 1 cena\(s\), 1 frase\(s\)/);
    expect(sessionStore.getState().session!.parts).toHaveLength(1);
  });

  it('exige áudio segmentado — guidance e store intacto', async () => {
    sessionStore.getState().load(fresh({ totalBeads: 0 }));
    render(<Imports />);

    await uploadTo(/entrega/i, DELIVERY);

    expect(await screen.findByText(/Segmente o áudio antes de carregar a entrega/)).toBeTruthy();
    expect(sessionStore.getState().session!.parts).toHaveLength(0);
  });
});

describe('estação imports — retorno', () => {
  it('carrega estado TRAVADO com partsConfirmed e flags, sem aviso de mismatch', async () => {
    sessionStore.getState().load(fresh());
    render(<Imports />);

    await uploadTo(/retorno/i, RETURN);
    await screen.findByText(/Retomado: 1 cena\(s\), 1 frase\(s\)/);

    const s = sessionStore.getState().session!;
    expect(s.whole.confirmed).toBe(true);
    expect(s.partsConfirmed).toBe(true);
    expect(s.parts[0]!.locked).toBe(true);
    expect(s.frases[0]!.locked).toBe(true);
    expect(s.frases[0]!.flagged).toBe(true);
    expect(s.current).toEqual({ layer: 'frases', index: -1 });
    expect(screen.queryByText(MISMATCH_MSG)).toBeNull();
  });
});

describe('estação imports — arquivo inválido', () => {
  it('entrega com schema inválido → mensagem PT-BR e store intacto', async () => {
    sessionStore.getState().load(fresh());
    render(<Imports />);

    await uploadTo(/entrega/i, { manifest_id: 123 });

    expect(await screen.findByText(/Não consegui ler a entrega/)).toBeTruthy();
    expect(sessionStore.getState().session!.parts).toHaveLength(0);
  });

  it('retorno com JSON malformado → mensagem PT-BR e store intacto', async () => {
    sessionStore.getState().load(fresh());
    render(<Imports />);

    await uploadTo(/retorno/i, 'isto não é json {');

    expect(await screen.findByText(/Não consegui ler o retorno/)).toBeTruthy();
    expect(sessionStore.getState().session!.parts).toHaveLength(0);
  });
});
