import { act, render, screen, waitFor, within } from '@testing-library/react';
import baseCss from '../../tokens/base.css?raw';
import reportCss from './report.css?raw';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AnswerDraft, Transcriber } from '../../../adapters/stt/types';
import { TranscriptSuperseded } from '../../../adapters/stt/types';
import { FixtureVoiceRecorder } from '../../../adapters/voice/fixture';
import type { VoiceRecorder } from '../../../adapters/voice/types';
import { buildMapReport, type ResourcePath } from '../../../contracts';
import {
  buildBeads,
  createSession,
  ensureMapping,
  type Frase,
  L1_Q,
  type ScenePart,
  setAnswer,
  type SessionState,
  type Span,
  voiceAnswerPath,
} from '../../../domain';
import i18n from '../../i18n';
import { sessionStore } from '../../state';
import { markSkipped } from '../conversation/answered';
import Report from './index';

/**
 * A estação Relatório (PRD v2 §8.7, redesign §6.6): o artefato consolidado e
 * EDITÁVEL — um cartão por pergunta (na ordem de `questionSequence`), com a
 * resposta digitada editável, a linha de voz (▶ + forma de onda + duração) quando
 * a resposta é uma gravação, o vazio "ainda sem resposta gravada", o marcador de
 * papel das perguntas conduzidas e a nota opcional da facilitadora. Exporta o
 * `.md` pelo builder de contracts (byte-idêntico) e a nota NUNCA sai no `.md`.
 */

const DURATION = 7.5;
const BEAD_SEC = 0.25;

function part(overrides: Partial<ScenePart>): ScenePart {
  return {
    part_id: 'PT1',
    span: null,
    locked: false,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
    ...overrides,
  };
}

function tagged(id: string, span: Span, kind = 'BIRTH_SCENE'): ScenePart {
  return part({
    part_id: id,
    span,
    locked: true,
    scene_kind: kind,
    scene_kind_confidence: 'high',
    tag_state: 'tagged',
  });
}

function frase(overrides: Partial<Frase>): Frase {
  return {
    prop_id: 'P1',
    statement: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    ...overrides,
  };
}

/** Sessão em Conversation com o answer store garantido: 1 cena tagged, 2 frases. */
function report(overrides: Partial<SessionState> = {}): SessionState {
  const base = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads: buildBeads(DURATION, BEAD_SEC),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  const state: SessionState = {
    ...base,
    whole: { ...base.whole, confirmed: true },
    partsConfirmed: true,
    mode: 'mapeamento',
    parts: [tagged('PT1', { s: 2, e: 8 })],
    frases: [frase({ prop_id: 'P1', span: { s: 2, e: 4 }, part_link: 'PT1', locked: true })],
    ...overrides,
  };
  return ensureMapping(state);
}

function load(state: SessionState): void {
  sessionStore.getState().load(state);
}

/** Semeia uma gravação no caminho da resposta (has(path) → true), com ~9 s de
 *  duração no relógio falso do fixture (90 quadros × 0,1 s) para a linha de voz. */
async function seedVoice(recorder: FixtureVoiceRecorder, path: string): Promise<void> {
  const rec = await recorder.start(path);
  for (let i = 0; i < 90; i += 1) rec.tick();
  await rec.stop();
}

/** O cartão que contém o texto exato da pergunta. */
function cardFor(q: string): HTMLElement {
  const card = screen.getByText(q).closest('.cds-report-card');
  if (!card) throw new Error(`sem cartão para: ${q}`);
  return card as HTMLElement;
}

/** O que a resposta desta pergunta mostra agora — a célula, como a facilitadora a vê. */
function answerOf(q: { q: string }): string {
  return (within(cardFor(q.q)).getByLabelText('resposta') as HTMLTextAreaElement).value;
}

/**
 * Recorder com `has()` controlado por caminho: os listados resolvem já; os demais
 * ficam pendurados para sempre — é o que prova que uma resposta NÃO espera as
 * outras (a barreira do Promise.all seguraria tudo).
 */
function controllableRecorder(known: Record<string, boolean>): VoiceRecorder {
  return {
    start: () => Promise.reject(new Error('não usado neste teste')),
    play: () => Promise.resolve(),
    duration: () => Promise.resolve(9),
    stopPlayback: () => {},
    has: (p: ResourcePath) =>
      p in known ? Promise.resolve(known[p]!) : new Promise<boolean>(() => {}),
    delete: () => Promise.resolve(),
    onPlayback: () => () => {},
  };
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Relatório — reprodução com cara de reprodução (ENG-323)', () => {
  it('clicar em ouvir mostra "abrindo…" até o som começar; tocando vira pausar; pausar volta', async () => {
    const q = L1_Q[0]!;
    const path = voiceAnswerPath({ level: 1, k: q.k });
    let emit: ((p: string | null) => void) | null = null;
    let releasePlay: (() => void) | null = null;
    const recorder: VoiceRecorder = {
      start: () => Promise.reject(new Error('não usado')),
      play: () =>
        new Promise((res) => {
          releasePlay = () => {
            emit?.(path);
            res();
          };
        }),
      duration: () => Promise.resolve(9),
      stopPlayback: () => emit?.(null),
      has: () => Promise.resolve(true),
      delete: () => Promise.resolve(),
      onPlayback: (cb) => {
        emit = cb;
        return () => {
          emit = null;
        };
      },
    };
    load(report());
    render(<Report recorder={recorder} />);

    const card = cardFor(q.q);
    await userEvent.click(await within(card).findByRole('button', { name: /ouvir a resposta/ }));
    // entre o toque e o som: o botão diz que está abrindo, sem aceitar clique
    const opening = within(card).getByRole('button', { name: /abrindo a resposta/ });
    expect((opening as HTMLButtonElement).disabled).toBe(true);

    await act(async () => releasePlay?.());
    // tocando: pausar + ondas acesas
    await userEvent.click(within(card).getByRole('button', { name: /pausar a resposta/ }));
    // pausado: volta ao ouvir
    expect(within(card).getByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
  });
});

describe('Relatório — a voz aparece conforme cada resposta resolve (ENG-319)', () => {
  it('uma resposta verificada aparece mesmo com outra verificação ainda no ar', async () => {
    const fastQ = L1_Q[0]!;
    const fastPath = voiceAnswerPath({ level: 1, k: fastQ.k });
    const recorder = controllableRecorder({ [fastPath]: true }); // as demais nunca resolvem

    load(report());
    render(<Report recorder={recorder} />);

    const card = cardFor(fastQ.q);
    expect(await within(card).findByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
  });

  it('enquanto a verificação voa, o cartão mostra "procurando", não "sem resposta"', () => {
    const pendingQ = L1_Q[1]!;
    const recorder = controllableRecorder({}); // nada resolve
    load(report());
    render(<Report recorder={recorder} />);

    const card = cardFor(pendingQ.q);
    expect(within(card).getByLabelText('procurando a resposta gravada')).toBeTruthy();
    expect(within(card).queryByPlaceholderText('ainda sem resposta gravada')).toBeNull();
  });

  it('descoberta pré-carregada abre a linha pronta, sem "procurando" (ENG-337)', () => {
    const knownQ = L1_Q[0]!;
    const knownPath = voiceAnswerPath({ level: 1, k: knownQ.k });
    const emptyQ = L1_Q[1]!;
    const emptyPath = voiceAnswerPath({ level: 1, k: emptyQ.k });
    const recorder = controllableRecorder({}); // nada resolve por conta própria

    load(report());
    render(
      <Report
        recorder={recorder}
        preloaded={{ checked: new Set([knownPath, emptyPath]), has: new Set([knownPath]) }}
      />,
    );

    // com gravação conhecida: a linha de voz já está lá, sem espera
    const known = cardFor(knownQ.q);
    expect(within(known).getByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
    expect(within(known).queryByLabelText('procurando a resposta gravada')).toBeNull();
    // conhecida SEM gravação: o vazio normal, também sem espera
    const empty = cardFor(emptyQ.q);
    expect(within(empty).getByPlaceholderText('ainda sem resposta gravada')).toBeTruthy();
    expect(within(empty).queryByLabelText('procurando a resposta gravada')).toBeNull();
  });

  it('verificada SEM gravação perde o "procurando" e volta ao vazio normal', async () => {
    const q = L1_Q[2]!;
    const path = voiceAnswerPath({ level: 1, k: q.k });
    const recorder = controllableRecorder({ [path]: false });
    load(report());
    render(<Report recorder={recorder} />);

    const card = cardFor(q.q);
    expect(await within(card).findByPlaceholderText('ainda sem resposta gravada')).toBeTruthy();
    expect(within(card).queryByLabelText('procurando a resposta gravada')).toBeNull();
  });

  /**
   * "ainda" promete uma resposta que ainda vem. Numa pergunta que a pessoa preferiu
   * não responder essa promessa é falsa — e o vazio é a única pista de que a marca
   * deixada na entrevista chegou até aqui.
   */
  it('a pergunta marcada sem resposta na entrevista diz isso, e não "ainda"', async () => {
    const q = L1_Q[0]!;
    const path = voiceAnswerPath({ level: 1, k: q.k });
    const recorder = controllableRecorder({ [path]: false });

    load(markSkipped(report(), { level: 1, k: q.k }));
    render(<Report recorder={recorder} />);

    const card = cardFor(q.q);
    expect(await within(card).findByPlaceholderText('sem resposta')).toBeTruthy();
    expect(within(card).queryByPlaceholderText('ainda sem resposta gravada')).toBeNull();
  });
});

describe('Relatório — cabeçalho do protótipo (redesign §6.6)', () => {
  it('mostra o cabeçalho do protótipo (eyebrow + manchete serifada)', () => {
    load(report());
    render(<Report />);

    expect(screen.getByText('A conversa sobre o sentido')).toBeTruthy();
    expect(screen.getByText('Tudo que vocês falaram, reunido.')).toBeTruthy();
  });
});

describe('Relatório — renderização por tipo de resposta (redesign §6.6)', () => {
  it('digitada mostra texto editável; só-voz mostra a linha de voz; vazia mostra "ainda sem resposta gravada"; conduzida traz o marcador de papel', async () => {
    const typedQ = L1_Q[0]!; // recontar
    const voiceQ = L1_Q[1]!; // arco_inicio_fim
    const emptyQ = L1_Q[2]!; // arco_muda
    const ledQ = L1_Q[10]!; // ausencia (conduzida pela facilitadora)

    const recorder = new FixtureVoiceRecorder();
    const voicePath = voiceAnswerPath({ level: 1, k: voiceQ.k });
    await seedVoice(recorder, voicePath);

    load(setAnswer(report(), { level: 1, k: typedQ.k }, 'era uma vez'));
    render(<Report recorder={recorder} />);

    // só-voz: ▶ ouvir a resposta + forma de onda + duração (resolvido assíncrono via has())
    const voiceCard = cardFor(voiceQ.q);
    expect(await within(voiceCard).findByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
    expect(voiceCard.querySelectorAll('.cds-waveform-bar').length).toBeGreaterThan(0);
    const duration = await within(voiceCard).findByLabelText('duração da resposta');
    expect(duration.textContent).toMatch(/^\d+:\d{2}$/); // duração real formatada, não "—"
    expect(duration.textContent).not.toBe('—');

    // digitada: textarea editável com o valor
    const typedCard = cardFor(typedQ.q);
    expect((within(typedCard).getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'era uma vez',
    );

    // vazia: estado "ainda sem resposta gravada"
    const emptyCard = cardFor(emptyQ.q);
    expect(within(emptyCard).getByPlaceholderText('ainda sem resposta gravada')).toBeTruthy();

    // conduzida pela facilitadora: marcador de papel
    const ledCard = cardFor(ledQ.q);
    expect(within(ledCard).getByRole('img', { name: 'conduzida pela facilitadora' })).toBeTruthy();
  });

  it('a gravação continua audível depois que a resposta tem texto (ENG-368)', async () => {
    const q = L1_Q[1]!; // arco_inicio_fim
    const recorder = new FixtureVoiceRecorder();
    await seedVoice(recorder, voiceAnswerPath({ level: 1, k: q.k }));

    // texto confirmado E gravação: a voz é a PROCEDÊNCIA da célula, e é justamente ao
    // conferir o texto que se quer reouvir. Some o player, some o único jeito de checar.
    load(setAnswer(report(), { level: 1, k: q.k }, 'era uma vez'));
    render(<Report recorder={recorder} />);

    const card = cardFor(q.q);
    expect(await within(card).findByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
    expect(card.querySelectorAll('.cds-waveform-bar').length).toBeGreaterThan(0);
    expect((within(card).getByRole('textbox') as HTMLTextAreaElement).value).toBe('era uma vez');
  });
});

describe('Relatório — edição e nota da facilitadora (PRD v2 §8.7, §10.4)', () => {
  /**
   * ENG-369: digitar não chega mais ao answer store sozinho. O texto fica em estado
   * local até alguém ACEITAR — é isso que dá a "descartar" algo a que voltar. Os três
   * testes abaixo cobrem o caminho inteiro: escrever, desistir, e confirmar.
   */
  it('digitar sozinho NÃO toca o answer store — aceitar é que escreve', async () => {
    const q = L1_Q[0]!;
    load(report());
    render(<Report />);

    const card = cardFor(q.q);
    await userEvent.type(within(card).getByRole('textbox'), 'resposta nova');
    expect(sessionStore.getState().session!.mapping?.level1[q.k] ?? '').toBe('');

    await userEvent.click(within(card).getByRole('button', { name: 'aceitar a edição' }));
    expect(sessionStore.getState().session!.mapping!.level1[q.k]).toBe('resposta nova');
  });

  it('descartar devolve o campo ao que estava, sem tocar o store', async () => {
    const q = L1_Q[0]!;
    load(setAnswer(report(), { level: 1, k: q.k }, 'era uma vez'));
    render(<Report />);

    const card = cardFor(q.q);
    const field = within(card).getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.clear(field);
    await userEvent.type(field, 'texto que vou desistir');

    await userEvent.click(within(card).getByRole('button', { name: 'descartar a edição' }));

    expect((within(card).getByRole('textbox') as HTMLTextAreaElement).value).toBe('era uma vez');
    expect(sessionStore.getState().session!.mapping!.level1[q.k]).toBe('era uma vez');
  });

  it('em repouso oferece o lápis; em edição, descartar e aceitar', async () => {
    const q = L1_Q[0]!;
    load(report());
    render(<Report />);

    const card = cardFor(q.q);
    expect(within(card).getByRole('button', { name: 'editar a resposta' })).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'aceitar a edição' })).toBeNull();

    await userEvent.type(within(card).getByRole('textbox'), 'x');

    expect(within(card).queryByRole('button', { name: 'editar a resposta' })).toBeNull();
    expect(within(card).getByRole('button', { name: 'descartar a edição' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'aceitar a edição' })).toBeTruthy();
  });

  it('a nota persiste no estado da sessão (relida no re-mount) e NÃO sai no .md exportado', async () => {
    const q = L1_Q[0]!;
    load(report());
    const view = render(<Report />);

    const before = buildMapReport(sessionStore.getState().session!);

    const card = cardFor(q.q);
    await userEvent.click(within(card).getByRole('button', { name: 'acrescentar uma observação' }));
    await userEvent.type(
      within(card).getByLabelText('observação da facilitadora'),
      'checar vocabulário',
    );

    // a nota volta a aparecer num re-mount → está no estado da sessão (blackbox)
    view.unmount();
    render(<Report />);
    expect(
      (within(cardFor(q.q)).getByLabelText('observação da facilitadora') as HTMLTextAreaElement)
        .value,
    ).toBe('checar vocabulário');

    // o .md é byte-idêntico ao de antes da nota e não a contém
    const after = buildMapReport(sessionStore.getState().session!);
    expect(after).toBe(before);
    expect(after).not.toContain('checar vocabulário');
  });
});

/**
 * Um rascunho como o teste o escreve. A geração é opcional aqui e só aqui: os casos
 * que não falam de frescor não deveriam ter de inventar um número, e os que falam
 * dizem exatamente qual.
 */
type DraftFixture = { source: string; en: string; generation?: number };

/** Uma confirmação como o servidor a recebeu. */
interface ConfirmCall {
  path: string;
  transcript: string;
  generation: number;
}

/**
 * Transcriber controlável: `resolve()` entrega os rascunhos quando o teste quiser.
 *
 * O `confirm` não é um espião: ele repete a rota real (`retranslate_answer`, tripod-api)
 * porque o relatório depende das três respostas dela. Texto idêntico volta na hora, sem
 * traduzir e sem mexer no contador — e essa comparação vem ANTES da guarda de geração,
 * senão reconfirmar viraria conflito. Geração vencida é recusa. O resto traduz, guarda e
 * incrementa. Um duplo que só registrasse a chamada passaria em qualquer implementação.
 */
function controllableStt(
  drafts: Record<string, DraftFixture>,
  opts: {
    /**
     * O inglês que o servidor deriva do texto confirmado. Identidade é o caminho da
     * entrevista EM INGLÊS, onde o servidor devolve o próprio transcript.
     */
    translate?: (text: string) => string;
    /** A confirmação fracassa (rede, 500) — nada volta e nada foi gravado lá. */
    confirmFails?: boolean;
  } = {},
): {
  stt: Transcriber;
  finish: () => void;
  started: string[][];
  /** As opções de cada `start` — é onde o `force` e o seu alcance aparecem. */
  asked: ({ force?: boolean; paths?: readonly string[] } | undefined)[];
  /** O que chegou ao servidor em cada confirmação, na ordem. */
  confirmed: ConfirmCall[];
  /** Reescreve o que o servidor guarda — é como se encena uma re-transcrição. */
  serve: (next: Record<string, DraftFixture>) => void;
} {
  const normalize = (d: Record<string, DraftFixture>): Record<string, AnswerDraft> =>
    Object.fromEntries(
      Object.entries(d).map(([p, v]) => [p, { ...v, generation: v.generation ?? 1 }]),
    );
  let ready = normalize(drafts);
  const started: string[][] = [];
  const asked: ({ force?: boolean; paths?: readonly string[] } | undefined)[] = [];
  const confirmed: ConfirmCall[] = [];
  let release: (() => void) | null = null;
  // o job só termina quando o TESTE mandar: `progress` espera esta promessa, então
  // nenhum caso depende da ordem dos microtasks nem do atraso real do polling
  const gate = new Promise<void>((res) => {
    release = res;
  });
  let settled = false;
  void gate.then(() => {
    settled = true;
  });
  return {
    started,
    asked,
    confirmed,
    serve: (next) => {
      ready = normalize(next);
    },
    finish: () => release?.(),
    stt: {
      start: (_id, paths, opts) => {
        started.push([...paths]);
        asked.push(opts);
        return Promise.resolve();
      },
      progress: async () => {
        await Promise.resolve();
        return settled ? { done: true, drafts: ready } : { done: false, drafts: {} };
      },
      confirm: async (_id, path, transcript, generation) => {
        await Promise.resolve();
        confirmed.push({ path, transcript, generation });
        if (opts.confirmFails) throw new Error('rede fora');
        const row = ready[path];
        if (!row) throw new Error(`sem rascunho guardado para ${path}`);
        if (transcript === row.source) return { en: row.en, generation: row.generation };
        if (generation !== row.generation) throw new TranscriptSuperseded('refeito por baixo');
        const en = (opts.translate ?? ((t: string) => t))(transcript);
        ready = { ...ready, [path]: { source: transcript, en, generation: row.generation + 1 } };
        return { en, generation: row.generation + 1 };
      },
    },
  };
}

describe('Relatório — rascunhos de transcrição e tradução (ENG-327)', () => {
  const Q = L1_Q[0]!;
  const PATH = voiceAnswerPath({ level: 1, k: Q.k });
  const DRAFTS = { [PATH]: { source: 'Ele contou do boto.', en: 'He told of the dolphin.' } };

  /**
   * ENG-367: a espera virou a TELA. Antes cada um dos 41 cartões dizia "transcrevendo"
   * e a revisão já estava lá para ser mexida enquanto o texto ainda ia mudar.
   */
  it('enquanto o job roda, a tela é a espera — nenhum cartão para mexer', async () => {
    const { stt } = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />,
    );

    await screen.findByText(/transcrevendo/i);
    expect(view.container.querySelectorAll('.cds-report-card')).toHaveLength(0);
    expect(screen.queryByLabelText('resposta')).toBeNull();
    // a região live continua montada e vazia: criada junto com o conteúdo, não seria
    // anunciada quando os rascunhos chegassem
    expect(view.container.querySelector('.cds-report-drafts-live')).not.toBeNull();
  });

  it('the wait speaks the interface language, not the name of the key', async () => {
    const { stt } = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />,
    );

    await screen.findByText(/transcrevendo/i);
    expect(view.container.textContent).not.toMatch(/transcribingEyebrow/i);
  });

  /**
   * The report sheet paints its own document surface (`--cds-ui-bg`, a 760px column,
   * 36+44 of breathing room). With the body swapped for the wait, that box was still
   * drawn — a band across the screen under the animation, exactly the width of the
   * column. The state owns the surface, so it has to reach the sheet.
   */
  it('while the job runs, the sheet does not paint its own box', async () => {
    const { stt } = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />,
    );

    await screen.findByText(/transcrevendo/i);
    expect(view.container.querySelector('.cds-report')?.className).toContain('cds-report--waiting');
  });

  it('with the drafts in hand, the sheet becomes the document surface again', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />,
    );

    finish();
    await screen.findByDisplayValue('Ele contou do boto.');
    expect(view.container.querySelector('.cds-report')?.className).not.toContain(
      'cds-report--waiting',
    );
  });

  it('the waiting sheet zeroes background and padding — the band has nowhere to come from', () => {
    const waiting = reportCss.slice(reportCss.indexOf('.cds-report--waiting'));
    expect(waiting).toMatch(/background:\s*none/);
    expect(waiting).toMatch(/padding:\s*0/);
  });

  it('o rascunho chega marcado como sugestão, e ainda NÃO é a resposta', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    finish();
    // o que se revisa é o TRANSCRIPT, na língua falada (ENG-370)
    const src = await screen.findByDisplayValue('Ele contou do boto.');

    const card = src.closest('.cds-report-card') as HTMLElement;
    expect(within(card).getByText(/sugestão/i)).toBeTruthy();
    // nada disto virou resposta ainda: o .md não traz nem o transcript nem o inglês
    const md = buildMapReport(sessionStore.getState().session!);
    expect(md).not.toContain('He told of the dolphin.');
    expect(md).not.toContain('Ele contou do boto.');
  });

  it('confirmar põe o TRANSCRIPT na resposta — e o .md sai em inglês (ENG-370)', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    finish();
    const src = await screen.findByDisplayValue('Ele contou do boto.');
    const card = src.closest('.cds-report-card') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /confirmar/i }));

    // a TELA fica na língua falada…
    expect((within(card).getByLabelText('resposta') as HTMLTextAreaElement).value).toBe(
      'Ele contou do boto.',
    );
    // …e o ARTEFATO, em inglês
    const md = buildMapReport(sessionStore.getState().session!);
    expect(md).toContain('He told of the dolphin.');
    expect(md).not.toContain('Ele contou do boto.');
  });

  it('corrigir o transcript antes de confirmar guarda o texto corrigido', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    finish();
    const src = await screen.findByDisplayValue('Ele contou do boto.');
    await userEvent.clear(src);
    await userEvent.type(src, 'Ele falou do boto-cor-de-rosa.');

    const card = src.closest('.cds-report-card') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /confirmar/i }));

    expect((within(card).getByLabelText('resposta') as HTMLTextAreaElement).value).toBe(
      'Ele falou do boto-cor-de-rosa.',
    );
  });

  /**
   * Entrevista em INGLÊS: no servidor a tradução é um no-op (`translate_to_english`
   * devolve o próprio transcript quando a língua já é inglês), então `en__` guarda o
   * texto CRU do reconhecedor — hesitação, repetição e recomeço inclusos. Como o
   * artefato prefere `en__` à célula, a correção que a facilitadora acabou de fazer
   * era descartada em silêncio e o `.md` saía com o verbatim do STT.
   *
   * O que um humano confirma é o transcript, e o inglês do artefato deriva DESSE texto
   * (CLAUDE.md, emenda ENG-370) — aqui os dois são o mesmo texto, então a célula manda.
   */
  it('em inglês, o .md sai com o transcript CORRIGIDO, não com o verbatim do STT', async () => {
    const RAW = 'He, he told of the... of the dolphin, you know.';
    const CLEAN = 'He told of the dolphin.';
    // caminho inglês: o rascunho volta com o MESMO texto nos dois campos
    const { stt, finish } = controllableStt({ [PATH]: { source: RAW, en: RAW } });
    await act(() => i18n.changeLanguage('en'));
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    finish();
    const src = await screen.findByDisplayValue(RAW);
    await userEvent.clear(src);
    await userEvent.type(src, CLEAN);

    const card = src.closest('.cds-report-card') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /confirm the transcript/i }));

    const md = buildMapReport(sessionStore.getState().session!);
    expect(md).toContain(CLEAN);
    expect(md).not.toContain(RAW);
  });

  it('apagar o transcript de propósito o mantém apagado ao remontar', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />,
    );

    finish();
    const src = await screen.findByDisplayValue('Ele contou do boto.');
    await userEvent.clear(src);

    view.unmount();
    const again = controllableStt(DRAFTS);
    again.finish();
    const remount = render(
      <Report recorder={controllableRecorder({ [PATH]: true })} stt={again.stt} sessionId="s-1" />,
    );

    // o rascunho NÃO ressuscita: a pessoa já o recusou
    const scope = within(remount.container);
    const field = (await scope.findByLabelText(/o que se ouviu/i)) as HTMLTextAreaElement;
    expect(field.value).toBe(''); // o rascunho NÃO ressuscita: a pessoa já o recusou
  });

  it('regravar a resposta substitui o rascunho obsoleto', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report
        recorder={controllableRecorder({ [PATH]: true })}
        stt={stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 1 }}
      />,
    );
    finish();
    await screen.findByDisplayValue('Ele contou do boto.');
    view.unmount();

    // a pessoa voltou, regravou (versão 2) e o job devolve outra tradução
    const novo = controllableStt({
      [PATH]: { source: 'Ele contou de novo.', en: 'He told it again.' },
    });
    novo.finish();
    render(
      <Report
        recorder={controllableRecorder({ [PATH]: true })}
        stt={novo.stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 2 }}
      />,
    );

    // confirmar não pode escrever o transcript de um áudio descartado
    await screen.findByDisplayValue('Ele contou de novo.');
    expect(screen.queryByDisplayValue('Ele contou do boto.')).toBeNull();
  });

  /**
   * O `recordingVersion` nasceu como estado de React, que morre no reload, enquanto a
   * versão semeada no rascunho é persistida no answer store. Reabrir uma sessão comparava
   * o valor persistido com um mapa vazio, concluía "a gravação mudou" e mandava `force`
   * — e o `force` é da sessão inteira. Toda entrevista feita em mais de uma sentada
   * re-transcrevia tudo na segunda, cobrando o provedor de novo por cada resposta.
   */
  it('reabrir a sessão com os rascunhos prontos não pede nada de novo', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report
        recorder={controllableRecorder({ [PATH]: true })}
        stt={stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 1 }}
      />,
    );
    finish();
    await screen.findByDisplayValue('Ele contou do boto.');
    view.unmount();

    // a volta: MESMA versão de gravação, agora vinda do meta persistido
    const volta = controllableStt(DRAFTS);
    volta.finish();
    render(
      <Report
        recorder={controllableRecorder({ [PATH]: true })}
        stt={volta.stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 1 }}
      />,
    );

    await screen.findByDisplayValue('Ele contou do boto.');
    expect(volta.asked.some((o) => o?.force)).toBe(false);
  });

  it('sessão antiga, sem versão nenhuma guardada, também não é re-transcrita', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report
        recorder={controllableRecorder({ [PATH]: true })}
        stt={stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 1 }}
      />,
    );
    finish();
    await screen.findByDisplayValue('Ele contou do boto.');
    view.unmount();

    // gravada antes de o `voiceVersion` existir: o meta volta sem entrada nenhuma
    const legada = controllableStt(DRAFTS);
    legada.finish();
    render(
      <Report
        recorder={controllableRecorder({ [PATH]: true })}
        stt={legada.stt}
        sessionId="s-1"
        recordingVersion={{}}
      />,
    );

    await screen.findByDisplayValue('Ele contou do boto.');
    expect(legada.asked.some((o) => o?.force)).toBe(false);
  });

  it('regravar uma resposta força SÓ ela — as outras não são pagas de novo', async () => {
    const outra = L1_Q[1]!;
    const outroPath = voiceAnswerPath({ level: 1, k: outra.k });
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report
        recorder={controllableRecorder({ [PATH]: true, [outroPath]: true })}
        stt={stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 1, [outroPath]: 1 }}
      />,
    );
    finish();
    await screen.findByDisplayValue('Ele contou do boto.');
    view.unmount();

    // só a primeira foi regravada
    const refeita = controllableStt(DRAFTS);
    refeita.finish();
    render(
      <Report
        recorder={controllableRecorder({ [PATH]: true, [outroPath]: true })}
        stt={refeita.stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 2, [outroPath]: 1 }}
      />,
    );

    await waitFor(() => expect(refeita.asked.some((o) => o?.force)).toBe(true));
    const forced = refeita.asked.find((o) => o?.force);
    expect(forced?.paths).toEqual([PATH]);
  });

  it('uma pergunta sem gravação nunca ganha rascunho', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    const outra = L1_Q[1]!;
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    finish();
    await screen.findByDisplayValue('Ele contou do boto.');

    const card = cardFor(outra.q);
    expect(within(card).queryByText(/sugestão/i)).toBeNull();
    expect(within(card).queryByRole('button', { name: /confirmar/i })).toBeNull();
  });

  it('só pede transcrição das respostas que TÊM gravação', async () => {
    const { stt, started } = controllableStt(DRAFTS);
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    // esperar o rótulo "transcrevendo" não serve aqui: ele aparece antes de `start`
    // ser chamado, e num runner lento a asserção corria antes do pedido sair
    await waitFor(() => expect(started.flat()).toEqual([PATH]));
  });

  it('a chegada dos rascunhos é anunciada por uma região registrada vazia de antemão', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    // registrada ANTES de ter conteúdo, senão o leitor de tela não anuncia nada
    const region = screen.getByRole('status', { name: /rascunho/i });
    expect(region.textContent).toBe('');

    finish();
    await screen.findByDisplayValue('Ele contou do boto.');
    // e o que se anuncia é o RESUMO, não o rascunho inteiro
    expect(region.textContent).toMatch(/1 resposta para revisar/i);
    expect(region.textContent).not.toContain('He told of the dolphin.');
  });
});

/**
 * O frescor do rascunho é a GERAÇÃO, não a versão da gravação.
 *
 * Uma sessão real foi transcrita antes de a limpeza de disfluência existir, foi
 * re-transcrita no servidor com sucesso, e o artefato saiu com as gagueiras assim
 * mesmo. A semeadura comparava a versão da GRAVAÇÃO — que uma re-transcrição não
 * toca — e por isso lia o rascunho guardado como corrente para sempre. Numa sessão
 * anterior ao contador de gravações os dois lados eram `0`, então a comparação dizia
 * "igual" eternamente.
 */
describe('Relatório — a transcrição refeita no servidor chega ao relatório', () => {
  const Q = L1_Q[0]!;
  const PATH = voiceAnswerPath({ level: 1, k: Q.k });
  const GAGA = { source: 'mas a, a história', en: 'but the, the story', generation: 1 };
  const LIMPO = { source: 'mas a história', en: 'but the story', generation: 2 };

  /** Abre o relatório com os rascunhos entregues e devolve a montagem. */
  function open(drafts: Record<string, DraftFixture>, version = 1) {
    const gravadas = Object.keys(drafts);
    const { stt, finish } = controllableStt(drafts);
    const view = render(
      <Report
        recorder={controllableRecorder(Object.fromEntries(gravadas.map((p) => [p, true])))}
        stt={stt}
        sessionId="s-1"
        recordingVersion={Object.fromEntries(gravadas.map((p) => [p, version]))}
      />,
    );
    finish();
    return view;
  }

  it('uma geração nova substitui o rascunho guardado, e o inglês vai junto', async () => {
    load(report());
    const primeira = open({ [PATH]: GAGA });
    await screen.findByDisplayValue(GAGA.source);
    primeira.unmount();

    // MESMA gravação, transcrição refeita no servidor
    open({ [PATH]: LIMPO });

    await screen.findByDisplayValue(LIMPO.source);
    expect(screen.queryByDisplayValue(GAGA.source)).toBeNull();

    const card = screen.getByDisplayValue(LIMPO.source).closest('.cds-report-card') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      const md = buildMapReport(sessionStore.getState().session!);
      expect(md).toContain(LIMPO.en);
      expect(md).not.toContain(GAGA.en);
    });
  });

  it('na MESMA geração nada é semeado de novo — a correção humana fica de pé', async () => {
    load(report());
    const primeira = open({ [PATH]: GAGA });
    const campo = await screen.findByDisplayValue(GAGA.source);
    await userEvent.clear(campo);
    await userEvent.type(campo, 'mas a história dela');
    primeira.unmount();

    // o servidor devolve OUTRO texto, mas na mesma geração: nada mudou lá
    open({ [PATH]: { ...LIMPO, generation: GAGA.generation } });

    expect(await screen.findByDisplayValue('mas a história dela')).toBeTruthy();
    expect(screen.queryByDisplayValue(LIMPO.source)).toBeNull();
  });

  /**
   * A segunda resposta gravada não é enfeite: é o SINCRONIZADOR. Sem uma semeadura que
   * de fato aconteça na segunda montagem, a asserção corre antes do efeito e o teste
   * passa mesmo com a proteção arrancada — foi o que aconteceu ao escrevê-lo.
   */
  it('a célula já respondida nunca é sobrescrita, nem por uma geração nova', async () => {
    const OUTRA = L1_Q[1]!;
    const OUTRO_PATH = voiceAnswerPath({ level: 1, k: OUTRA.k });
    load(report());
    const primeira = open({
      [PATH]: GAGA,
      [OUTRO_PATH]: { source: 'e, e começa na cheia', en: 'and, and it starts in the flood' },
    });
    await screen.findByDisplayValue(GAGA.source);
    const card = cardFor(Q.q);
    await userEvent.type(within(card).getByLabelText('resposta'), 'Foi o avô quem contou.');
    await userEvent.click(within(card).getByRole('button', { name: 'aceitar a edição' }));
    primeira.unmount();

    open({
      [PATH]: LIMPO,
      [OUTRO_PATH]: {
        source: 'e começa na cheia',
        en: 'and it starts in the flood',
        generation: 2,
      },
    });

    // a OUTRA resposta, de célula vazia, recebe o texto novo: a semeadura correu
    await screen.findByDisplayValue('e começa na cheia');
    expect(answerOf(Q)).toBe('Foi o avô quem contou.');
    const md = buildMapReport(sessionStore.getState().session!);
    expect(md).toContain('Foi o avô quem contou.');
    expect(md).not.toContain(LIMPO.en);
  });
});

/**
 * Confirmar é o que manda o texto corrigido ao servidor.
 *
 * O relatório lê `en__` para o artefato, e `en__` é a tradução do texto que o servidor
 * guardava — não do texto que a facilitadora acabou de corrigir. Uma edição confirmada só
 * localmente NUNCA chegava ao `.md`: o documento saía com a tradução da frase substituída.
 * A rota que resolve isto existe (`PUT …/transcriptions/{path}`): ela traduz o que foi
 * confirmado e devolve o inglês.
 */
describe('Relatório — confirmar manda o transcript ao servidor e traz o inglês de volta', () => {
  const Q = L1_Q[0]!;
  const PATH = voiceAnswerPath({ level: 1, k: Q.k });
  const ORIGINAL = { source: 'Ele contou do boto.', en: 'He told of the dolphin.', generation: 7 };

  function open(stt: Transcriber) {
    return render(
      <Report
        recorder={controllableRecorder({ [PATH]: true })}
        stt={stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 1 }}
      />,
    );
  }

  /** O botão de confirmar DESTE cartão — o de lote também casa com /confirmar/i. */
  function confirmButton(): HTMLElement {
    return within(cardFor(Q.q)).getByRole('button', { name: /confirmar a transcrição/i });
  }

  it('o transcript corrigido vai ao servidor com a geração do rascunho, e o inglês que volta é o que sai no documento', async () => {
    const CORRIGIDO = 'Ele falou do boto-cor-de-rosa.';
    const { stt, finish, confirmed } = controllableStt(
      { [PATH]: ORIGINAL },
      { translate: () => 'He spoke of the pink dolphin.' },
    );
    load(report());
    open(stt);
    finish();

    const src = await screen.findByDisplayValue(ORIGINAL.source);
    await userEvent.clear(src);
    await userEvent.type(src, CORRIGIDO);
    await userEvent.click(confirmButton());

    await waitFor(() =>
      expect(confirmed).toEqual([
        { path: PATH, transcript: CORRIGIDO, generation: ORIGINAL.generation },
      ]),
    );
    await waitFor(() => {
      const md = buildMapReport(sessionStore.getState().session!);
      expect(md).toContain('He spoke of the pink dolphin.');
      expect(md).not.toContain(ORIGINAL.en);
    });
  });

  it('confirmar o texto que já estava deixa a resposta confirmada', async () => {
    const { stt, finish } = controllableStt({ [PATH]: ORIGINAL });
    load(report());
    open(stt);
    finish();

    await screen.findByDisplayValue(ORIGINAL.source);
    await userEvent.click(confirmButton());

    await waitFor(() => expect(answerOf(Q)).toBe(ORIGINAL.source));
    expect(buildMapReport(sessionStore.getState().session!)).toContain(ORIGINAL.en);
  });

  /**
   * O pior desfecho seria o silêncio: célula confirmada com um `en__` que descreve outra
   * frase, e o documento saindo com ela. Se o servidor não guardou, a resposta continua
   * por confirmar — o gate de exportação segue vermelho, que é a verdade, e o texto
   * corrigido continua no campo para uma segunda tentativa.
   */
  it('um confirmar que fracassa não confirma a resposta, e diz que não confirmou', async () => {
    const { stt, finish } = controllableStt({ [PATH]: ORIGINAL }, { confirmFails: true });
    load(report());
    open(stt);
    finish();

    const src = await screen.findByDisplayValue(ORIGINAL.source);
    await userEvent.clear(src);
    await userEvent.type(src, 'Ele falou do boto.');
    await userEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(answerOf(Q)).toBe('');
    expect(buildMapReport(sessionStore.getState().session!)).not.toContain(ORIGINAL.en);
    // e o texto corrigido não se perde: uma segunda tentativa custa um clique
    expect((screen.getByLabelText(/o que se ouviu/i) as HTMLTextAreaElement).value).toBe(
      'Ele falou do boto.',
    );
  });

  /**
   * Conflito é a outra resposta da rota, e pede o oposto de uma retentativa: repetir manda
   * a mesma geração vencida e perde de novo. Só reler o rascunho resolve — e o texto novo
   * é o do servidor, porque a edição era de uma frase que já não existe.
   */
  it('um confirmar em conflito recarrega o rascunho em vez de sobrescrever', async () => {
    const { stt, finish, serve } = controllableStt({ [PATH]: ORIGINAL });
    load(report());
    open(stt);
    finish();

    const src = await screen.findByDisplayValue(ORIGINAL.source);
    // o servidor refez a transcrição por baixo da facilitadora
    serve({
      [PATH]: {
        source: 'Ele contou do boto-cor-de-rosa.',
        en: 'He told of the pink dolphin.',
        generation: 9,
      },
    });
    await userEvent.clear(src);
    await userEvent.type(src, 'Ele falou do boto.');
    await userEvent.click(confirmButton());

    expect(await screen.findByDisplayValue('Ele contou do boto-cor-de-rosa.')).toBeTruthy();
    expect(answerOf(Q)).toBe('');
  });
});

/**
 * Confirmar todas as transcrições de uma vez. Uma entrevista longa chega ao relatório
 * com centenas de respostas gravadas sem texto, e o gate de exportação
 * (`reportExportStatus`, @/contracts/relatorio) recusa guardar enquanto sobrar uma.
 * Confirmar uma a uma não é fluxo de trabalho — o lote é o caminho por dentro do gate,
 * nunca por cima dele.
 *
 * Os casos que importam são os NEGATIVOS: a resposta escrita à mão que não pode ser
 * atropelada pelo texto da máquina, o diálogo que não confirma nada antes do sim, e a
 * resposta sem rascunho que precisa aparecer no resultado em vez de sumir num "pronto".
 */
describe('Relatório — confirmar todas as transcrições de uma vez', () => {
  const BULK_Q = [L1_Q[0]!, L1_Q[1]!, L1_Q[2]!];
  const BULK_PATHS = BULK_Q.map((q) => voiceAnswerPath({ level: 1, k: q.k }));
  const BULK_DRAFTS: Record<string, { source: string; en: string }> = {
    [BULK_PATHS[0]!]: { source: 'Ele contou do boto.', en: 'He told of the dolphin.' },
    [BULK_PATHS[1]!]: { source: 'Começa na cheia.', en: 'It starts in the flood.' },
    [BULK_PATHS[2]!]: { source: 'Ela mudou de ideia.', en: 'She changed her mind.' },
  };

  const ACTION = 'Confirmar todas as transcrições';
  const ACCEPT = 'Aceitar as transcrições';
  const REVIEW = 'Rever uma a uma';

  /** O relatório aberto com os rascunhos já na mão — o estado em que o lote existe. */
  async function openWithDrafts(
    drafts: Record<string, { source: string; en: string }>,
    recorded: string[] = Object.keys(drafts),
  ): Promise<void> {
    const { stt, finish } = controllableStt(drafts);
    load(report());
    render(
      <Report
        recorder={controllableRecorder(Object.fromEntries(recorded.map((p) => [p, true])))}
        stt={stt}
        sessionId="s-1"
      />,
    );
    finish();
    for (const d of Object.values(drafts)) await screen.findByDisplayValue(d.source);
  }

  it('confirma de uma vez toda resposta pendente que tinha rascunho', async () => {
    await openWithDrafts(BULK_DRAFTS);

    await userEvent.click(screen.getByRole('button', { name: ACTION }));
    await userEvent.click(screen.getByRole('button', { name: ACCEPT }));

    expect(BULK_Q.map(answerOf)).toEqual(BULK_PATHS.map((p) => BULK_DRAFTS[p]!.source));
    // sem nada mais por confirmar, a ação sai da tela
    expect(screen.queryByRole('button', { name: ACTION })).toBeNull();
  });

  it('pergunta antes: abrir não confirma nada, e desistir deixa tudo como estava', async () => {
    await openWithDrafts(BULK_DRAFTS);

    await userEvent.click(screen.getByRole('button', { name: ACTION }));
    expect(BULK_Q.map(answerOf)).toEqual(['', '', '']);

    await userEvent.click(screen.getByRole('button', { name: REVIEW }));
    expect(BULK_Q.map(answerOf)).toEqual(['', '', '']);
  });

  /**
   * O pior que este recurso poderia fazer: apagar com texto de máquina a resposta que a
   * facilitadora escreveu com as próprias mãos. O rascunho continua guardado ao lado da
   * célula depois que ela digita — é só a célula cheia que o protege.
   */
  it('não sobrescreve a resposta que a facilitadora escreveu à mão', async () => {
    await openWithDrafts(BULK_DRAFTS);

    const mine = cardFor(BULK_Q[0]!.q);
    await userEvent.type(within(mine).getByLabelText('resposta'), 'Foi o avô quem contou.');
    await userEvent.click(within(mine).getByRole('button', { name: 'aceitar a edição' }));

    await userEvent.click(screen.getByRole('button', { name: ACTION }));
    await userEvent.click(screen.getByRole('button', { name: ACCEPT }));

    expect(answerOf(BULK_Q[0]!)).toBe('Foi o avô quem contou.');
    expect(answerOf(BULK_Q[1]!)).toBe(BULK_DRAFTS[BULK_PATHS[1]!]!.source);
  });

  it('a resposta gravada SEM rascunho fica intacta, e o resultado diz que ela ainda falta', async () => {
    const comRascunho = BULK_PATHS[0]!;
    const semRascunho = BULK_PATHS[1]!;
    await openWithDrafts({ [comRascunho]: BULK_DRAFTS[comRascunho]! }, [comRascunho, semRascunho]);

    await userEvent.click(screen.getByRole('button', { name: ACTION }));
    await userEvent.click(screen.getByRole('button', { name: ACCEPT }));

    const resultado = screen.getByRole('status', { name: 'resultado da confirmação em lote' });
    expect(resultado.textContent).toMatch(/1 resposta confirmada/i);
    expect(resultado.textContent).toMatch(/ainda falta 1 resposta/i);
    expect(answerOf(BULK_Q[1]!)).toBe('');
  });

  /**
   * A mesma assimetria do confirmar avulso (ENG-370). Em PT o `en__` é a tradução e
   * segue sendo o que o artefato emite; em inglês ele é o VERBATIM do reconhecedor, e
   * mantê-lo publicaria o áudio bruto por cima do texto conferido. Perder isto dentro
   * de um laço faz o `.md` sair errado numa das duas línguas, em silêncio.
   */
  it('em português o lote preserva o inglês: o .md sai em inglês', async () => {
    const path = BULK_PATHS[0]!;
    await openWithDrafts({ [path]: BULK_DRAFTS[path]! });

    await userEvent.click(screen.getByRole('button', { name: ACTION }));
    await userEvent.click(screen.getByRole('button', { name: ACCEPT }));

    const md = buildMapReport(sessionStore.getState().session!);
    expect(md).toContain('He told of the dolphin.');
    expect(md).not.toContain('Ele contou do boto.');
  });

  it('em inglês o lote descarta o verbatim: o .md sai com o transcript corrigido', async () => {
    const RAW = 'He, he told of the... of the dolphin, you know.';
    const CLEAN = 'He told of the dolphin.';
    const path = BULK_PATHS[0]!;
    await act(() => i18n.changeLanguage('en'));
    await openWithDrafts({ [path]: { source: RAW, en: RAW } });

    const src = screen.getByDisplayValue(RAW);
    await userEvent.clear(src);
    await userEvent.type(src, CLEAN);

    await userEvent.click(screen.getByRole('button', { name: 'Confirm every transcript' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accept the transcripts' }));

    const md = buildMapReport(sessionStore.getState().session!);
    expect(md).toContain(CLEAN);
    expect(md).not.toContain(RAW);
  });

  it('sem nada por confirmar, a ação nem aparece', () => {
    load(report());
    render(<Report />);

    expect(screen.queryByRole('button', { name: ACTION })).toBeNull();
  });
});

/**
 * Refazer as respostas que foram confirmadas a partir de um rascunho vencido.
 *
 * A guarda nova impede que isto volte a acontecer; não resgata a sessão onde já
 * aconteceu. Lá as células estão preenchidas com o texto gaguejado, e a proteção que
 * salva a digitação humana — célula cheia não se sobrescreve — recusa mexer nelas, com
 * razão. Este lote é o caminho explícito, com o seu preço dito em voz alta.
 */
describe('Relatório — refazer as respostas confirmadas de um rascunho vencido', () => {
  const Q = L1_Q[0]!;
  const PATH = voiceAnswerPath({ level: 1, k: Q.k });
  /** A resposta que a máquina nunca transcreveu e a facilitadora escreveu à mão. */
  const MINHA_Q = L1_Q[1]!;
  const MINHA_PATH = voiceAnswerPath({ level: 1, k: MINHA_Q.k });
  const MINHA_RESPOSTA = 'Foi o avô quem contou.';
  const GAGA = { source: 'mas a, a história', en: 'but the, the story', generation: 1 };
  const LIMPO = { source: 'mas a história', en: 'but the story', generation: 2 };

  const REDO = 'Refazer as transcrições vencidas';
  const REDO_ACCEPT = 'Refazer as respostas';
  const REDO_KEEP = 'Deixar como estão';

  function mount(stt: Transcriber) {
    return render(
      <Report
        recorder={controllableRecorder({ [PATH]: true, [MINHA_PATH]: true })}
        stt={stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 1, [MINHA_PATH]: 1 }}
      />,
    );
  }

  /**
   * A sessão exata que isto existe para resgatar: uma resposta confirmada a partir da
   * transcrição gaguejada, e ao lado dela uma resposta sem rascunho nenhum, escrita à mão.
   */
  async function sessaoJaConfirmadaDoRascunhoVelho(): Promise<void> {
    load(report());
    const antes = controllableStt({ [PATH]: GAGA });
    const view = mount(antes.stt);
    antes.finish();

    const src = await screen.findByDisplayValue(GAGA.source);
    const card = src.closest('.cds-report-card') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /confirmar a transcrição/i }));
    await waitFor(() => expect(answerOf(Q)).toBe(GAGA.source));

    const minha = cardFor(MINHA_Q.q);
    await userEvent.type(within(minha).getByLabelText('resposta'), MINHA_RESPOSTA);
    await userEvent.click(within(minha).getByRole('button', { name: 'aceitar a edição' }));
    view.unmount();
  }

  /** A volta, com o servidor já tendo refeito a transcrição. */
  function reabreComTranscricaoRefeita() {
    const depois = controllableStt({ [PATH]: LIMPO });
    mount(depois.stt);
    depois.finish();
    return depois;
  }

  it('refaz a resposta confirmada de um rascunho vencido, e o inglês vai junto', async () => {
    await sessaoJaConfirmadaDoRascunhoVelho();
    reabreComTranscricaoRefeita();

    await userEvent.click(await screen.findByRole('button', { name: REDO }));
    await userEvent.click(screen.getByRole('button', { name: REDO_ACCEPT }));

    await waitFor(() => expect(answerOf(Q)).toBe(LIMPO.source));
    const md = buildMapReport(sessionStore.getState().session!);
    expect(md).toContain(LIMPO.en);
    expect(md).not.toContain(GAGA.en);
  });

  /**
   * O que este lote não pode fazer de jeito nenhum. Sem rascunho não há de que refazer:
   * o texto é dela.
   */
  it('a resposta escrita à mão, sem rascunho, fica de fora', async () => {
    await sessaoJaConfirmadaDoRascunhoVelho();
    const depois = reabreComTranscricaoRefeita();

    await userEvent.click(await screen.findByRole('button', { name: REDO }));
    await userEvent.click(screen.getByRole('button', { name: REDO_ACCEPT }));

    await waitFor(() => expect(answerOf(Q)).toBe(LIMPO.source));
    expect(answerOf(MINHA_Q)).toBe(MINHA_RESPOSTA);
    // e nem chegou a ser oferecida ao servidor
    expect(depois.confirmed.map((c) => c.path)).toEqual([PATH]);
  });

  /**
   * O caso que "veio de um rascunho" sozinho não cobre: o rascunho FOI semeado, e depois
   * a facilitadora escreveu a própria resposta por cima. O `src__` continua guardado ao
   * lado da célula, então só a igualdade entre os dois separa "isto é o texto confirmado
   * da máquina" de "isto é o que ela escreveu".
   */
  it('a resposta que a facilitadora escreveu por cima do rascunho também fica de fora', async () => {
    load(report());
    const antes = controllableStt({ [PATH]: GAGA });
    const view = mount(antes.stt);
    antes.finish();
    const card = (await screen.findByDisplayValue(GAGA.source)).closest(
      '.cds-report-card',
    ) as HTMLElement;
    await userEvent.type(within(card).getByLabelText('resposta'), MINHA_RESPOSTA);
    await userEvent.click(within(card).getByRole('button', { name: 'aceitar a edição' }));
    view.unmount();

    reabreComTranscricaoRefeita();
    // o anúncio dos rascunhos só aparece com o job concluído: é o instante em que a
    // elegibilidade do lote já foi decidida
    await screen.findByText(/para revisar/i);

    expect(screen.queryByRole('button', { name: REDO })).toBeNull();
    expect(answerOf(Q)).toBe(MINHA_RESPOSTA);
  });

  it('pergunta antes: abrir não refaz nada, e desistir deixa tudo como estava', async () => {
    await sessaoJaConfirmadaDoRascunhoVelho();
    const depois = reabreComTranscricaoRefeita();

    await userEvent.click(await screen.findByRole('button', { name: REDO }));
    expect(answerOf(Q)).toBe(GAGA.source);
    // o foco inicial é a saída que não escreve nada: um Enter distraído não troca texto
    // confirmado por texto de máquina
    expect(document.activeElement).toBe(screen.getByRole('button', { name: REDO_KEEP }));

    await userEvent.click(screen.getByRole('button', { name: REDO_KEEP }));
    expect(answerOf(Q)).toBe(GAGA.source);
    expect(depois.confirmed).toEqual([]);
  });
});

/**
 * ENG-505: a espera é para quem tem o que esperar. O job está SEMPRE 'running' ao montar
 * — nenhum resultado chegou ainda —, então decidir a tela só pela fase manda à espera
 * toda revisão reaberta, inclusive as que não têm nada a transcrever. No pior caso o
 * poll gira até o teto de cinco minutos com o trabalho já pronto atrás do cometa.
 *
 * A regra é: espera-se enquanto o job roda E alguma resposta gravada ainda PRECISA de
 * rascunho — sem texto confirmado e sem rascunho utilizável. Sozinhos, os dois casos
 * abaixo seriam satisfeitos por nunca mais esperar; quem segura esse outro lado é a
 * espera da ENG-367, no bloco acima.
 */
describe('Relatório — reabrir uma revisão que não tem o que transcrever (ENG-505)', () => {
  const Q = L1_Q[0]!;
  const PATH = voiceAnswerPath({ level: 1, k: Q.k });
  const DRAFTS = { [PATH]: { source: 'Ele contou do boto.', en: 'He told of the dolphin.' } };

  it('com a resposta gravada já confirmada, reabrir cai na revisão, não na espera', async () => {
    const { stt } = controllableStt(DRAFTS); // o job NUNCA termina
    load(setAnswer(report(), { level: 1, k: Q.k }, 'Ele contou do boto.'));
    const view = render(
      <Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />,
    );

    // a linha de voz só acende depois de a gravação ser descoberta — é a partir daí
    // que a tela de espera apareceria
    expect(await screen.findByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();

    // a tela de espera pela marca que só ela tem: dizer "transcrevendo" seria ambíguo,
    // porque um cartão em revisão também o diz
    expect(view.container.querySelector('.cds-report')?.className).not.toContain(
      'cds-report--waiting',
    );
    expect(view.container.querySelectorAll('.cds-report-card').length).toBeGreaterThan(0);
  });

  it('com o rascunho já semeado e ainda por confirmar, reabrir mostra o rascunho', async () => {
    const primeira = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report
        recorder={controllableRecorder({ [PATH]: true })}
        stt={primeira.stt}
        sessionId="s-1"
      />,
    );
    primeira.finish();
    await screen.findByDisplayValue('Ele contou do boto.');
    view.unmount();

    // a pessoa saiu sem confirmar e voltou: o rascunho está guardado, e não há nada a
    // transcrever de novo — a revisão abre com ele à mão
    const { stt } = controllableStt(DRAFTS); // o job NUNCA termina
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    expect(await screen.findByDisplayValue('Ele contou do boto.')).toBeTruthy();
    expect(screen.queryByText(/transcrevendo/i)).toBeNull();
  });

  it('regravar depois do rascunho traz a espera de volta, sem mostrar o texto do áudio descartado', async () => {
    const primeira = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report
        recorder={controllableRecorder({ [PATH]: true })}
        stt={primeira.stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 1 }}
      />,
    );
    primeira.finish();
    await screen.findByDisplayValue('Ele contou do boto.');
    view.unmount();

    // a pessoa regravou: o rascunho guardado descreve um áudio que não existe mais
    const { stt } = controllableStt(DRAFTS); // o job NUNCA termina
    render(
      <Report
        recorder={controllableRecorder({ [PATH]: true })}
        stt={stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 2 }}
      />,
    );

    await screen.findByText(/transcrevendo/i);
    expect(screen.queryByDisplayValue('Ele contou do boto.')).toBeNull();
  });
});

/**
 * ENG-372: o foco global (base.css) desenha um retângulo telha de 3px afastado 3px.
 * Num campo transparente de largura total isso vira uma caixa que briga com a linha
 * quieta que o campo é. Aqui o indicador troca de FORMA, não de força — e o teste
 * existe para que ninguém o apague junto com o outline.
 */
describe('Relatório — foco do campo de resposta (ENG-372)', () => {
  const rule =
    /\.cds-report-typed:focus-visible,\s*\.cds-report-note:focus-visible\s*{[^}]*}/.exec(
      reportCss,
    )?.[0] ?? '';

  it('abre mão do retângulo global', () => {
    expect(rule).toContain('outline: none');
  });

  it('mas mantém um indicador de foco visível — geometria E cor, não só cor', () => {
    // o filete da esquerda engrossa E vira telha: quem não distingue cor ainda vê a mudança
    expect(rule).toContain('border-left-width: 3px');
    expect(rule).toContain('var(--cds-ui-accent)');
  });

  it('não mexe na regra global de foco', () => {
    expect(baseCss).toContain('outline: 3px solid var(--cds-telha)');
  });
});
