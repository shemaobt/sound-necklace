import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AnswerDraft, Transcriber } from '../../../adapters/stt/types';
import type { VoiceRecorder } from '../../../adapters/voice/types';
import {
  EN_ANSWER_PREFIX,
  type AnswerSlot,
  ensureMapping,
  type Mapping,
  type QuestionSlot,
  questionSequence,
  type SessionState,
  setAnswer,
  voiceAnswerPath,
} from '../../../domain';
import { questionTextFor } from '../../i18n/conversation-questions';
import { interviewIsEnglish } from '../../i18n/interview-language';
import { Button, WaveformBar } from '../../atoms';
import { PreparingSession } from '../../organisms';
import type { PaletteEntry } from '../../tokens';
import { isSkipped } from '../conversation/answered';
import { type BlockLabels, blockEyebrow } from '../conversation/trechos';
import { sessionStore, useSessionStore } from '../../state';
import { BulkConfirm, type BulkResult } from './confirm-all-dialog';
import { type SttPhase, useSttDrafts } from './use-stt-drafts';
import './report.css';

/**
 * A estação Relatório (PRD v2 §8.7 "The report", redesign §6.6): o artefato
 * consolidado e EDITÁVEL. Um cartão por pergunta na ordem que o domínio produz
 * (`questionSequence`); cada cartão traz a resposta digitada editável, ou — quando
 * a resposta existe só como gravação — a linha de voz (▶ + forma de onda + duração),
 * ou o vazio "ainda sem resposta gravada". Perguntas conduzidas pela facilitadora
 * levam um marcador de papel. Baixar é a tela SEGUINTE ("Guardar os documentos →"):
 * os atalhos .md/.json que a referência tinha aqui (L1136–1154) eram duplicatas dos
 * três cartões de lá e faziam quatro controles disputarem um rodapé que o protótipo
 * resolve com um.
 *
 * Superfície FACILITADORA (§7.2): dígitos e IDs são permitidos aqui (≠ telas do
 * ouvinte) — daí o numeral "Q11" de cada cartão. Camada de wiring: recebe a porta
 * `VoiceRecorder` (playback das respostas) por prop; nada de domínio/contracts
 * muda. As edições de texto passam por `setAnswer` (store preguiçoso).
 *
 * DUAS coisas vivem no answer store sob chaves RESERVADAS, no MESMO bucket da
 * resposta: a nota da facilitadora (`nota__<k>`) e o inglês em revisão do rascunho
 * de transcrição (`en__<k>`, ENG-327). Ambas persistem no autosave e no round-trip
 * do DTO (buckets são `record<string,string>` livres), mas `buildMapReport` só
 * percorre o vocabulário das perguntas (`L1_Q/L2_Q/L3_Q`) → nenhuma das duas sai no
 * `.md` (§10.4: o esqueleto congelado não tem essas linhas). É assim que
 * "rascunho não confirmado nunca entra em artefato" vale POR CONSTRUÇÃO, e não por
 * lembrança de quem for mexer no builder um dia.
 *
 * Confirmar é implícito: o inglês confirmado É a resposta, escrita no slot real
 * pelo mesmo `setAnswer` da digitação. Não existe flag de confirmação para
 * dessincronizar — e apagar a resposta desconfirma, que é o que se espera.
 */
/** Descoberta de voz feita ANTES de abrir a revisão (ENG-337): as linhas nascem prontas. */
export interface PreloadedVoice {
  /** caminhos cuja verificação já respondeu (com ou sem gravação) */
  checked: ReadonlySet<string>;
  /** caminhos COM gravação */
  has: ReadonlySet<string>;
}

export interface ReportProps {
  recorder?: VoiceRecorder | null;
  preloaded?: PreloadedVoice;
  /** Transcrição+tradução das respostas gravadas (ENG-327). Ausente ⇒ só digitar. */
  stt?: Transcriber | null;
  /** Sessão do job de transcrição; sem ela o job não dispara. */
  sessionId?: string | null;
  /**
   * Quantas vezes cada resposta foi GRAVADA. Regravar reusa o mesmo caminho, então
   * é este contador — e só ele — que distingue a gravação nova da antiga: sem ele
   * um rascunho obsoleto seguiria confirmável, escrevendo no artefato a tradução
   * de um áudio que a pessoa descartou (ENG-327).
   */
  recordingVersion?: Record<string, number>;
  /**
   * Tells the station that the transcription wait has taken over the screen. The
   * navigation footer lives in the PARENT, outside this sheet, and without this signal
   * it stayed under the wait offering the way out to the Export with the drafts still
   * in flight.
   */
  onWaitingChange?: (waiting: boolean) => void;
}

/** Prefixo da chave reservada da nota — fora do vocabulário de perguntas. */
const NOTE_PREFIX = 'nota__';

/** Alturas fixas das barras decorativas da linha de voz (px). */
const WAVE_HEIGHTS = [6, 12, 20, 14, 22, 10, 16, 8];

/** Lápis, xis e visto dos controles de edição da resposta (ENG-369). */
function PencilGlyph() {
  return (
    <svg {...ACT_SVG}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function CrossGlyph() {
  return (
    <svg {...ACT_SVG}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg {...ACT_SVG}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const ACT_SVG = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

/** m:ss para a linha de voz do relatório. */
function formatDuration(sec: number): string {
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Prefixo do rascunho de tradução (ENG-327) — mesma mecânica da nota: chave
 * reservada, fora do vocabulário de perguntas, invisível para `buildMapReport`.
 * É o que garante "rascunho não confirmado nunca entra em artefato" por
 * construção, e não por lembrança de quem escreve o builder.
 */
const DRAFT_EN_PREFIX = EN_ANSWER_PREFIX;

/**
 * O TRANSCRIPT em revisão — a língua em que a pessoa falou (ENG-370). É este que um
 * humano confirma; o inglês da chave `en__` vai direto ao artefato sem confirmação
 * (decisão do dono: só a transcrição se verifica). Antes os dois eram a mesma chave,
 * porque confirmar gravava o inglês na célula; separá-los é a mudança.
 */
const DRAFT_SRC_PREFIX = 'src__';

/**
 * Versão da gravação que produziu o rascunho guardado em `en__<k>`. Precisa ser
 * DURÁVEL: voltar à entrevista para regravar desmonta o relatório, então um ref
 * em memória não sobrevive justamente à navegação que ele existe para detectar.
 */
const DRAFT_VER_PREFIX = 'enver__';

/**
 * Geração do rascunho guardado em `src__<k>`/`en__<k>` — o contador que o SERVIDOR
 * mantém para aquela resposta.
 *
 * Existe porque a versão da gravação não responde à pergunta que a semeadura faz. Uma
 * re-transcrição não toca na gravação: uma sessão real foi transcrita antes de a limpeza
 * de disfluência existir, refeita depois com sucesso, e o rascunho guardado seguiu
 * "corrente" porque os dois lados da comparação continuavam iguais — numa sessão anterior
 * ao `voiceVersion` os dois eram `0`, e a comparação dizia "igual" para sempre. O artefato
 * saiu com as gagueiras que o servidor já tinha removido.
 *
 * A AUSÊNCIA desta chave lê-se como "superado", ao contrário da ausência de `enver__`.
 * São perguntas diferentes: `enver__` ausente significa "nunca transcrito", e forçar ali
 * pagaria de novo por todas as outras respostas; `gen__` ausente significa "semeado antes
 * de sabermos de que geração era", e essa é exatamente a sessão que precisa dar lugar ao
 * texto novo. O preço é uma re-semeadura única por sessão antiga cujo rascunho ainda não
 * foi confirmado — a célula preenchida continua intocada.
 */
const DRAFT_GEN_PREFIX = 'gen__';

/** O slot da nota: a mesma resposta sob a chave reservada `nota__<k>`. */
function noteSlot(slot: QuestionSlot): AnswerSlot {
  return reservedSlot(slot, NOTE_PREFIX);
}

/** O slot do inglês em revisão, ainda NÃO confirmado. */
function draftEnSlot(slot: QuestionSlot): AnswerSlot {
  return reservedSlot(slot, DRAFT_EN_PREFIX);
}

/** O slot do transcript em revisão, ainda NÃO confirmado. */
function draftSrcSlot(slot: QuestionSlot): AnswerSlot {
  return reservedSlot(slot, DRAFT_SRC_PREFIX);
}

/** O slot da versão de gravação a que o rascunho guardado corresponde. */
function draftVerSlot(slot: QuestionSlot): AnswerSlot {
  return reservedSlot(slot, DRAFT_VER_PREFIX);
}

/** O slot da geração do servidor a que o rascunho guardado corresponde. */
function draftGenSlot(slot: QuestionSlot): AnswerSlot {
  return reservedSlot(slot, DRAFT_GEN_PREFIX);
}

function reservedSlot(slot: QuestionSlot, prefix: string): AnswerSlot {
  const k = prefix + slot.k;
  switch (slot.level) {
    case 1:
      return { level: 1, k };
    case 2:
      return { level: 2, partId: slot.partId, k };
    case 3:
      return { level: 3, propId: slot.propId, k };
  }
}

/** id estável para casar <label> e <textarea> do rascunho. */
function draftFieldId(slot: QuestionSlot): string {
  return slot.level === 1
    ? `1-${slot.k}`
    : slot.level === 2
      ? `2-${slot.partId}-${slot.k}`
      : `3-${slot.propId}-${slot.k}`;
}

/**
 * A chave existe no bucket? Distingue "nunca preenchida" de "esvaziada por alguém"
 * — `readAnswer` devolve '' nos dois casos. É o que impede o rascunho de renascer
 * por cima de uma edição humana quando a tela remonta (voltar à sessão, recarregar).
 */
function hasAnswerKey(m: Mapping | null, slot: AnswerSlot): boolean {
  if (!m) return false;
  if (slot.level === 1) return slot.k in m.level1;
  if (slot.level === 2) return slot.k in (m.level2[slot.partId] ?? {});
  return slot.k in (m.level3[slot.propId] ?? {});
}

function readAnswer(m: Mapping | null, slot: AnswerSlot): string {
  if (!m) return '';
  if (slot.level === 1) return m.level1[slot.k] ?? '';
  if (slot.level === 2) return m.level2[slot.partId]?.[slot.k] ?? '';
  return m.level3[slot.propId]?.[slot.k] ?? '';
}

interface Row {
  slot: QuestionSlot;
  /** cabeçalho do bloco (protótipo `showHeader`): cor + eyebrow "Cena 1 · tipo"; null no meio do bloco */
  header: { eyebrow: string; color: PaletteEntry } | null;
  /** posição da pergunta DENTRO do bloco (protótipo `Q`+(bq+1)), 1-based */
  num: number;
}

/** id do bloco: a história, cada cena, cada frase (protótipo `blockId`). */
function blockIdOf(slot: QuestionSlot): string {
  return slot.level === 1 ? 'story' : slot.level === 2 ? slot.partId : slot.propId;
}

/**
 * Agrupa a sequência por BLOCO (protótipo `reportRows`): a cada troca de bloco um
 * cabeçalho colorido (bolinha + eyebrow), e o numeral do cartão reinicia dentro do
 * bloco. Sem as seções "A história/As cenas/As frases" — o próprio cabeçalho de
 * bloco é a separação.
 */
function toRows(
  state: SessionState,
  sequence: QuestionSlot[],
  lang: string,
  labels: BlockLabels,
): Row[] {
  const rows: Row[] = [];
  let last = '';
  let num = 0;
  for (const slot of sequence) {
    const id = blockIdOf(slot);
    const start = id !== last;
    num = start ? 1 : num + 1;
    last = id;
    rows.push({ slot, header: start ? blockEyebrow(state, slot, lang, labels) : null, num });
  }
  return rows;
}

/** Marcador de papel do protótipo: a pergunta que a facilitadora conduz. SVG inline,
 *  nunca unicode — um emoji renderiza diferente em cada sistema e não é da marca. */
function NotebookGlyph() {
  return (
    <svg
      className="cds-report-role-glyph"
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
  );
}

/** O "+" do convite da observação (protótipo noteClosed). */
function PlusGlyph() {
  return (
    <svg
      className="cds-report-add-note-glyph"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

/**
 * O rascunho da máquina (ENG-327): conselho, nunca resposta. Fica marcado como
 * sugestão até alguém confirmar a transcrição — e é o inglês, ao lado dela, que vai ao documento.
 * Digitar à mão continua disponível o tempo todo: se o job falhar ou demorar, o
 * campo de resposta do cartão resolve sozinho (§8.7 — sem beco sem saída).
 */
function DraftReview({
  slot,
  show,
  phase,
  draft,
  draftText,
  onDraftText,
  onConfirm,
  onRetry,
}: {
  slot: QuestionSlot;
  show: boolean;
  phase: SttPhase;
  draft?: AnswerDraft;
  /** O TRANSCRIPT em revisão — a língua falada. O inglês não passa por aqui. */
  draftText: string;
  onDraftText?: (text: string) => void;
  onConfirm?: () => void;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  if (!show) return null;
  if (phase === 'running')
    return <p className="cds-report-draft-status">{t('report.transcribing')}</p>;
  if (phase === 'failed') {
    return (
      <p className="cds-report-draft-status">
        {t('report.draftFailed')}{' '}
        <Button variant="ghost" size="sm" onClick={onRetry}>
          {t('report.draftRetry')}
        </Button>
      </p>
    );
  }
  if (!draft) return null;
  const fieldId = `en-${draftFieldId(slot)}`;
  return (
    <div className="cds-report-draft">
      <p className="cds-report-draft-badge">{t('report.draftBadge')}</p>
      <label className="cds-report-draft-label" htmlFor={fieldId}>
        {t('report.draftSource')}
      </label>
      {/* O que se confere é o que foi DITO, na língua em que foi dito (ENG-370). O
          inglês do artefato é gerado a partir daqui e não passa por esta tela: só a
          transcrição se confirma. */}
      <textarea
        id={fieldId}
        className="cds-report-draft-en"
        rows={2}
        value={draftText}
        onChange={(e) => onDraftText?.(e.target.value)}
      />
      <Button variant="ghost" size="sm" onClick={onConfirm}>
        {t('report.draftConfirm')}
      </Button>
    </div>
  );
}

interface ReportCardProps {
  slot: QuestionSlot;
  /** Posição na conversa (protótipo `r.num`): "Q11". Superfície de facilitadora (§7.2). */
  num: number;
  typed: string;
  note: string;
  hasVoice: boolean;
  /**
   * A entrevista marcou esta pergunta como sem resposta. O vazio do cartão passa a dizer
   * isso em vez de "ainda sem resposta gravada": "ainda" promete uma resposta que não vem.
   */
  skipped: boolean;
  /** A verificação da gravação ainda voa: mostra "procurando", não o vazio (ENG-319). */
  voicePending: boolean;
  /** ESTA resposta está tocando agora (eventos reais da porta, ENG-323). */
  playing?: boolean;
  /** Entre o toque e o som começar (o blob pode estar baixando): botão "abrindo…". */
  opening?: boolean;
  onStopPlay?: () => void;
  durationSec?: number;
  onTyped: (text: string) => void;
  onNote: (text: string) => void;
  onPlay: () => void;
  /** Fase do job de transcrição desta sessão (ENG-327). */
  sttPhase?: SttPhase;
  /** Rascunho desta resposta, quando o job já entregou. */
  draft?: AnswerDraft;
  /** Inglês do rascunho, editável antes de confirmar. */
  draftText?: string;
  onDraftText?: (text: string) => void;
  onConfirmDraft?: () => void;
  onRetryDraft?: () => void;
}

function ReportCard({
  slot,
  num,
  typed,
  note,
  hasVoice,
  skipped,
  voicePending,
  playing = false,
  opening = false,
  onStopPlay,
  durationSec,
  onTyped,
  onNote,
  onPlay,
  sttPhase = 'idle',
  draft,
  draftText = '',
  onDraftText,
  onConfirmDraft,
  onRetryDraft,
}: ReportCardProps) {
  const { t, i18n } = useTranslation();
  const [showNote, setShowNote] = useState(note !== '');
  /** `null` = em repouso; string = edição em curso, ainda fora do answer store. */
  const [editing, setEditing] = useState<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const facilitatorLed = slot.k === 'ausencia';
  const voiceOnly = hasVoice && !typed.trim();
  const pendingRow = voicePending && !hasVoice && !typed.trim();
  // O rascunho só interessa enquanto a resposta não tem texto confirmado: uma vez
  // confirmada, o cartão é uma linha respondida como qualquer outra.
  const awaitingConfirm = hasVoice && !typed.trim();

  return (
    <div className="cds-report-card">
      {/* cabeçalho do protótipo: numeral areia · pergunta · marcador de papel */}
      <div className="cds-report-head">
        <span className="cds-report-num" aria-hidden="true">
          Q{num}
        </span>
        <p className="cds-report-q">{questionTextFor(slot, i18n.language)}</p>
        {facilitatorLed ? (
          <span
            className="cds-report-role"
            role="img"
            aria-label={t('report.facilitatorLed')}
            title={t('report.facilitatorLed')}
          >
            <NotebookGlyph />
          </span>
        ) : null}
      </div>

      {/* A gravação fica enquanto existir, não só enquanto for a única resposta (ENG-368):
          ela é a PROCEDÊNCIA da célula, e confirmar o texto é justamente quando se quer
          reouvir para conferir. Antes o player sumia no instante da confirmação. */}
      {hasVoice ? (
        <div className="cds-report-voice">
          <Button
            variant="ghost"
            size="sm"
            disabled={opening}
            onClick={playing ? onStopPlay : onPlay}
          >
            {opening
              ? t('report.openingAnswer')
              : playing
                ? t('report.pauseAnswer')
                : t('report.playAnswer')}
          </Button>
          <span className="cds-report-wave" aria-hidden="true">
            {WAVE_HEIGHTS.map((h, i) => (
              <WaveformBar key={i} height={h} active={playing} />
            ))}
          </span>
          <span className="cds-report-duration" aria-label={t('report.answerDuration')}>
            {durationSec === undefined ? '—' : formatDuration(durationSec)}
          </span>
        </div>
      ) : pendingRow ? (
        // procurando a gravação: a onda apagada segura o lugar — nunca o vazio
        <div
          className="cds-report-voice is-pending"
          role="status"
          aria-label={t('report.voicePending')}
        >
          <span className="cds-report-wave" aria-hidden="true">
            {WAVE_HEIGHTS.map((h, i) => (
              <WaveformBar key={i} height={h} />
            ))}
          </span>
        </div>
      ) : null}

      <DraftReview
        slot={slot}
        show={awaitingConfirm}
        phase={sttPhase}
        draft={draft}
        draftText={draftText}
        onDraftText={onDraftText}
        onConfirm={onConfirmDraft}
        onRetry={onRetryDraft}
      />

      {/* A digitação vive AQUI (decisão do dono: a entrevista é só-voz). O campo segue
          quieto: uma linha, sem caixa nem alça, que cresce ao escrever — uma caixa de
          64px em cada um dos 41 cartões era um formulário, não um relato.
          ENG-369: editar passou a ser um ato deliberado. O texto digitado vive em estado
          LOCAL e só chega ao answer store quando alguém aceita — é isso que dá o que
          descartar. Sem isso, "descartar" não teria a que voltar. */}
      <div className="cds-report-answer">
        <textarea
          ref={fieldRef}
          className="cds-report-typed"
          aria-label={t('report.answer')}
          rows={1}
          placeholder={
            voiceOnly || pendingRow
              ? t('report.writeAnswer')
              : skipped
                ? t('report.noAnswerGiven')
                : t('report.noAnswerYet')
          }
          value={editing === null ? typed : editing}
          onChange={(e) => setEditing(e.target.value)}
        />
        <div className="cds-report-answer-actions">
          {editing === null ? (
            /* o lápis diz que a linha É editável — sem ele, um campo sem caixa nem
               alça não se anuncia. Focar o campo e escrever continua funcionando. */
            <button
              type="button"
              className="cds-report-act"
              aria-label={t('report.editAnswer')}
              title={t('report.editAnswer')}
              onClick={() => fieldRef.current?.focus()}
            >
              <PencilGlyph />
            </button>
          ) : (
            <>
              <button
                type="button"
                className="cds-report-act"
                aria-label={t('report.discardEdit')}
                title={t('report.discardEdit')}
                onClick={() => setEditing(null)}
              >
                <CrossGlyph />
              </button>
              <button
                type="button"
                className="cds-report-act is-accept"
                aria-label={t('report.acceptEdit')}
                title={t('report.acceptEdit')}
                onClick={() => {
                  onTyped(editing);
                  setEditing(null);
                }}
              >
                <CheckGlyph />
              </button>
            </>
          )}
        </div>
      </div>

      {showNote ? (
        <textarea
          className="cds-report-note"
          aria-label={t('report.typedAria')}
          rows={2}
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
      ) : (
        // link de texto com "+", não pílula (protótipo noteClosed): é um convite
        // discreto, e uma pílula por cartão competia com a pergunta
        <button type="button" className="cds-report-add-note" onClick={() => setShowNote(true)}>
          <PlusGlyph />
          {t('report.addNote')}
        </button>
      )}
    </div>
  );
}

export function Report({
  recorder = null,
  preloaded,
  stt = null,
  sessionId = null,
  recordingVersion,
  onWaitingChange,
}: ReportProps) {
  const { t, i18n } = useTranslation();
  // A entrevista correu em inglês? É a MESMA regra que o wiring usa para dizer a língua
  // ao job (@/ui/app/App.tsx), e é o que decide se o rascunho tem tradução a preservar.
  const spokenInEnglish = interviewIsEnglish(i18n.language);
  const session = useSessionStore((s) => s.session);
  // O preload (ENG-337) semeia os dois conjuntos: linha conhecida nasce resolvida,
  // sem passar pelo "procurando"; o efeito abaixo só completa o que faltou.
  const [voiceSet, setVoiceSet] = useState<ReadonlySet<string>>(() => preloaded?.has ?? new Set());
  const [voiceDurations, setVoiceDurations] = useState<ReadonlyMap<string, number>>(new Map());
  // Caminhos cuja verificação já RESPONDEU (com ou sem gravação): antes disso o
  // cartão mostra "procurando", nunca o vazio — carregando ≠ sem resposta (ENG-319).
  const [voiceChecked, setVoiceChecked] = useState<ReadonlySet<string>>(
    () => preloaded?.checked ?? new Set(),
  );
  // Reprodução com cara de reprodução (ENG-323): o caminho TOCANDO vem dos eventos
  // reais da porta; `opening` é a janela entre o toque e o som começar (fetch do blob).
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  // O que o lote de fato fez — medido depois de escrever, nunca a partir do plano.
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  // Visão de LEITURA com o answer store garantido mesmo antes do efeito persistir.
  const mapped = useMemo(() => {
    if (!session) return null;
    return session.mapping ? session : ensureMapping(session);
  }, [session]);
  const sequence = useMemo(() => (mapped ? questionSequence(mapped) : []), [mapped]);
  // Caminhos de voz das perguntas — chave estrutural ESTÁVEL: só muda quando o
  // conjunto de perguntas muda (cenas/frases), não a cada tecla digitada numa
  // resposta (`setAnswer` recria `mapped`, mas o conjunto de perguntas é o mesmo).
  const voiceKey = useMemo(() => sequence.map((s) => voiceAnswerPath(s)).join('|'), [sequence]);
  const voicePaths = useMemo(() => (voiceKey ? voiceKey.split('|') : []), [voiceKey]);

  useEffect(() => {
    if (session && !session.mapping) sessionStore.getState().apply((s) => ensureMapping(s));
  }, [session]);

  useEffect(() => {
    if (!recorder) return;
    return recorder.onPlayback((p) => {
      setPlayingPath(p);
      setOpeningPath(null); // o som começou (ou parou): a espera acabou
    });
  }, [recorder]);

  // Descobre quais respostas TÊM gravação: define a linha de voz, escolhe o que vai
  // para o job de transcrição e conta o que ainda espera confirmação. NUNCA alimenta
  // o `.md` — a gravação é proveniência e o builder nem recebe caminhos (ENG-356).
  // POR RESPOSTA, sem barreira (ENG-319): um Promise.all sobre os ~41 caminhos
  // segurava TODAS as linhas de voz até o caminho mais lento responder — no modo
  // real (rede + decode por blob) o relatório abria parecendo sem respostas. Cada
  // verificação resolve e acende o próprio cartão; a duração (que baixa/decodifica
  // o blob) chega depois, sem segurar a linha.
  useEffect(() => {
    // Sem recorder não há gravação a descobrir: o estado inicial já é vazio (sem
    // setState síncrono no efeito — react-hooks/set-state-in-effect).
    if (!recorder) return;
    let alive = true;
    const discover = async (p: string, known: boolean | undefined): Promise<void> => {
      const h = known ?? (await recorder.has(p).catch(() => false));
      if (!alive) return;
      setVoiceChecked((prev) => (prev.has(p) ? prev : new Set(prev).add(p)));
      if (!h) return;
      setVoiceSet((prev) => (prev.has(p) ? prev : new Set(prev).add(p)));
      const sec = await recorder.duration(p).catch(() => 0);
      if (alive) setVoiceDurations((prev) => new Map(prev).set(p, sec));
    };
    for (const p of voicePaths) {
      // caminho já resolvido pelo preload (ENG-337): não re-pergunta à API — só a
      // duração ainda chega assíncrona, sem segurar a linha
      void discover(p, preloaded?.checked.has(p) ? preloaded.has.has(p) : undefined);
    }
    return () => {
      alive = false;
    };
  }, [recorder, voicePaths, preloaded]);

  // Só as respostas COM gravação vão para o job — não há o que transcrever nas outras.
  // `voiceSet` cresce um caminho por vez (ENG-319, sem barreira), então a lista pode
  // começar parcial. Esperar a descoberta inteira seria pior — um único `has()`
  // pendurado travaria a transcrição de todas as outras.
  const recordedPaths = voicePaths.filter((p) => voiceSet.has(p));
  /**
   * The answers whose stored draft belongs to a take that no longer exists — the ONLY
   * ones a `force` is allowed to touch.
   *
   * Both sides of this comparison have to survive a reload, and for a long time only
   * one did. `enver__` is persisted in the answer store; `recordingVersion` was React
   * state that reset to `{}` on every load. So reopening a session compared a stored
   * "1" against a fresh "0", concluded every answer had been re-recorded, and sent a
   * session-wide force: an interview spread over two sittings paid the provider for
   * all of its answers again, every time. `recordingVersion` now comes from the
   * persisted session meta, which is what makes the comparison mean anything.
   *
   * Two absences read as "nothing to redo", and both matter. No `enver__` means the
   * answer was never transcribed — there is no stale draft to throw away, and the
   * ordinary idempotent POST already seeds it; forcing here would reset the drafts of
   * every OTHER answer to do it. And no entry in `recordingVersion` means a session
   * saved before `voiceVersion` existed, where the stored draft is the only truth
   * available — treating it as changed would re-transcribe every legacy session once.
   */
  const stalePaths = recordedPaths.filter((p) => {
    const slot = sequence.find((s) => voiceAnswerPath(s) === p);
    if (!slot) return false;
    if (readAnswer(mapped?.mapping ?? null, slot).trim()) return false;
    const seeded = readAnswer(mapped?.mapping ?? null, draftVerSlot(slot));
    if (!seeded) return false;
    const recorded = recordingVersion?.[p];
    if (recorded === undefined) return false;
    return seeded !== String(recorded);
  });
  const {
    phase: sttPhase,
    drafts,
    retry,
  } = useSttDrafts(stt, sessionId, recordedPaths, recordingVersion, stalePaths);

  const waiting = sttPhase === 'running';
  // Layout, not a plain effect: the signal goes up BEFORE paint. With `useEffect` the
  // parent only reacted once the wait was already on screen, and the footer flashed
  // for a frame.
  useLayoutEffect(() => {
    onWaitingChange?.(waiting);
    // unmounting the sheet with the wait standing would hide the footer forever
    return () => onWaitingChange?.(false);
  }, [waiting, onWaitingChange]);

  // O inglês que chegou vira o conteúdo INICIAL do campo em revisão, gravado uma
  // única vez na chave reservada. Depois disso o campo é da pessoa: apagá-lo tem
  // de deixá-lo apagado — ler o rascunho como fallback ressuscitaria o texto que
  // ela acabou de recusar.
  useEffect(() => {
    for (const [path, draft] of Object.entries(drafts)) {
      const slot = sequence.find((s) => voiceAnswerPath(s) === path);
      if (!slot) continue;
      const m = mapped?.mapping ?? null;
      const version = String(recordingVersion?.[path] ?? 0);
      const generation = String(draft.generation);
      const seededVersion = readAnswer(m, draftVerSlot(slot));
      const seededGeneration = readAnswer(m, draftGenSlot(slot));
      // a existência do TRANSCRIPT é o que marca "já semeado": é ele que um humano
      // edita, então é sobre ele que vale a promessa de não ressuscitar texto apagado
      const known = hasAnswerKey(m, draftSrcSlot(slot));
      // já existe resposta escrita à mão: o rascunho chegou tarde e não tem o que
      // propor. Semear o inglês aqui o faria vencer o texto da pessoa no artefato
      // (ENG-370) — o mesmo motivo pelo qual digitar descarta o inglês.
      if (readAnswer(m, slot).trim()) continue;
      // A chave já existe, é da MESMA gravação E da MESMA geração: houve edição humana
      // (inclusive apagá-la de propósito) e não se mexe. Se QUALQUER um dos dois mudou,
      // o que está ali foi superado — pela gravação (o áudio foi descartado) ou pelo
      // servidor (o texto foi refeito) — e dá lugar ao rascunho novo. Comparar só a
      // gravação era o bug: uma re-transcrição não a toca, então o rascunho velho
      // seguia de pé e o artefato saía com o texto que o servidor já tinha corrigido.
      if (known && seededVersion === version && seededGeneration === generation) continue;
      sessionStore.getState().apply((s) => {
        // o inglês vai para a chave que o ARTEFATO lê (contracts/relatorio, ENG-370);
        // o transcript, para a chave que a TELA edita
        const withEn = setAnswer(s.mapping ? s : ensureMapping(s), draftEnSlot(slot), draft.en);
        const withSrc = setAnswer(withEn, draftSrcSlot(slot), draft.source);
        const withVer = setAnswer(withSrc, draftVerSlot(slot), version);
        return setAnswer(withVer, draftGenSlot(slot), generation);
      });
    }
  }, [drafts, sequence, mapped, recordingVersion]);

  if (!session || !mapped || !sequence.length) return null;

  // eyebrow de bloco COM dígito — o relatório é superfície da facilitadora (§7.2)
  const blockLabels: BlockLabels = {
    story: t('report.groupStory'),
    scene: (n) => t('report.groupScene', { n }),
    phrase: (n) => t('report.groupPhrase', { n }),
  };
  const rows = toRows(mapped, sequence, i18n.language, blockLabels);

  /**
   * Quantas respostas GRAVADAS ainda estão sem texto confirmado — a mesma conta que o
   * gate de exportação faz (`reportExportStatus`, @/contracts/relatorio), feita aqui
   * sobre a descoberta de voz desta tela. Recebe um estado qualquer porque o lote
   * precisa medir DEPOIS de escrever, e não a partir do que pretendia escrever.
   */
  const pendingIn = (state: SessionState | null): number =>
    state
      ? questionSequence(state).filter(
          (s) => voiceSet.has(voiceAnswerPath(s)) && !readAnswer(state.mapping, s).trim(),
        ).length
      : 0;

  /**
   * Digitar à mão DESCARTA o inglês da máquina (ENG-370). Quem escreve a própria
   * resposta está dizendo que a transcrição não serve — e uma tradução que descreve
   * outro texto é pior no artefato do que a língua de origem, porque contradiz a
   * resposta em silêncio. Confirmar não passa por aqui, justamente para preservá-la.
   */
  const writeTyped = (slot: QuestionSlot, text: string): void => {
    sessionStore.getState().apply((s) => {
      const base = s.mapping ? s : ensureMapping(s);
      return setAnswer(setAnswer(base, draftEnSlot(slot), ''), slot, text);
    });
  };
  const writeNote = (slot: QuestionSlot, text: string): void => {
    sessionStore
      .getState()
      .apply((s) => setAnswer(s.mapping ? s : ensureMapping(s), noteSlot(slot), text));
  };
  const writeDraftSrc = (slot: QuestionSlot, text: string): void => {
    sessionStore
      .getState()
      .apply((s) => setAnswer(s.mapping ? s : ensureMapping(s), draftSrcSlot(slot), text));
  };
  /**
   * O ATO de confirmar uma resposta, sobre um estado qualquer. Vive fora do `apply`
   * porque o lote precisa aplicá-lo N vezes dentro de UMA transação — e porque um
   * segundo caminho de confirmação divergiria da assimetria PT/EN abaixo sem que
   * nenhum teste percebesse até o artefato sair errado.
   */
  const confirmInto = (s: SessionState, slot: QuestionSlot, text: string): SessionState => {
    const base = s.mapping ? s : ensureMapping(s);
    // Entrevista em inglês: não houve tradução — o servidor devolve o próprio
    // transcript, então `en__` guarda o VERBATIM do reconhecedor, hesitação e
    // repetição inclusas. Mantê-lo faria o artefato emitir o áudio bruto por cima
    // do texto que a pessoa acabou de corrigir e conferir, e a correção sumiria em
    // silêncio (o `.md` prefere `en__` à célula). Descartá-lo é o que faz valer a
    // regra: o inglês do artefato deriva do texto CONFIRMADO.
    if (spokenInEnglish) return setAnswer(setAnswer(base, draftEnSlot(slot), ''), slot, text);
    // Em PT o inglês desta gravação continua sendo o que o artefato emite: a célula
    // guarda a língua falada, e apagar `en__` faria o `.md` sair em português.
    return setAnswer(base, slot, text);
  };

  /** Confirmar: o TRANSCRIPT em revisão vira A resposta, pelo mesmo caminho de digitar. */
  const confirmDraft = (slot: QuestionSlot, text: string): void => {
    sessionStore.getState().apply((s) => confirmInto(s, slot, text));
  };

  /**
   * Confirmar TODAS de uma vez (decisão do dono, 2026-08-12). Uma entrevista longa chega
   * aqui com centenas de respostas gravadas sem texto, e o gate de exportação recusa
   * guardar enquanto sobrar uma: confirmar uma a uma não é fluxo de trabalho. Isto
   * SATISFAZ o gate, e é a única coisa que o satisfaz — `contracts/relatorio` não sabe
   * que esta ação existe e não muda por causa dela.
   *
   * Elegível é o par exato: tem transcrição E a célula ainda está vazia. A célula cheia
   * é o que protege a resposta que a facilitadora escreveu à mão — o rascunho continua
   * guardado ao lado dela depois que ela digita, e sem essa condição o lote apagaria o
   * texto dela com o da máquina.
   *
   * Uma transação só: `apply` por resposta dispararia um autosave e um render por
   * item, e 467 deles atravessariam a rede em fila.
   */
  const bulkConfirmable = sequence.filter(
    (slot) =>
      voiceSet.has(voiceAnswerPath(slot)) &&
      !readAnswer(mapped.mapping, slot).trim() &&
      readAnswer(mapped.mapping, draftSrcSlot(slot)).trim() !== '',
  );

  const confirmAllDrafts = (): void => {
    const before = pendingIn(mapped);
    sessionStore.getState().apply((s) =>
      bulkConfirmable.reduce((acc, slot) => {
        // relido do estado que se está construindo, não do render: é a mesma condição
        // de elegibilidade, aplicada sobre a verdade do momento da escrita
        if (readAnswer(acc.mapping, slot).trim()) return acc;
        const text = readAnswer(acc.mapping, draftSrcSlot(slot));
        // o texto vai como está, não aparado: confirmar avulso escreve o valor do campo,
        // e "o mesmo ato" precisa escrever o mesmo byte
        return text.trim() ? confirmInto(acc, slot, text) : acc;
      }, s),
    );
    // O resultado é LIDO do estado depois, nunca do plano: `apply` é silenciosamente
    // ignorado fora da edição (offline, revisão, trava), e um "pronto" contado a partir
    // do que se pretendia fazer mentiria justamente quando nada aconteceu.
    const after = pendingIn(sessionStore.getState().session);
    setBulkResult({ confirmed: Math.max(0, before - after), remaining: after });
  };

  // Quantas respostas gravadas ainda esperam confirmação — o número que o leitor
  // de tela ouve quando os rascunhos chegam.
  /**
   * ENG-367: enquanto a transcrição roda, a espera é a TELA — não uma palavra dentro de
   * cada um dos 41 cartões. Chegar à revisão com tudo dizendo "transcrevendo" convida a
   * mexer no que ainda vai mudar. Reusa o cometa de contas da espera de sessão (ENG-337),
   * a mesma animação das outras esperas do fluxo.
   *
   * A troca é do MIOLO, não da tela: a região live fica montada nos dois estados, porque
   * uma região criada junto com o conteúdo não é anunciada — trocar a árvore inteira
   * perderia o aviso dos rascunhos em silêncio.
   *
   * 'failed' e o esgotamento do prazo não seguram ninguém: a revisão abre e cada cartão
   * traz seu "tentar de novo", porque digitar à mão sempre resolve (§8.7 — sem beco).
   *
   * The sheet drops its own document surface while it waits (`--waiting`): the 760px
   * column with background and padding, emptied of content, turned into a band across
   * the screen under the animation.
   */
  const toReview = pendingIn(mapped);

  return (
    <section className={waiting ? 'cds-report cds-report--waiting' : 'cds-report'}>
      {waiting ? null : (
        <header className="cds-report-header">
          <p className="cds-report-eyebrow">{t('report.eyebrow')}</p>
          <p className="cds-report-headline">{t('report.headline')}</p>
        </header>
      )}
      {/* Confirmar tudo de uma vez: mora onde os rascunhos estão e onde a recusa da
          exportação manda a facilitadora. */}
      <BulkConfirm
        pending={waiting ? 0 : bulkConfirmable.length}
        result={bulkResult}
        onConfirm={confirmAllDrafts}
      />
      {/* Registrada VAZIA desde o início: uma região live criada junto com o
          conteúdo não é anunciada. Anuncia o resumo, nunca os rascunhos inteiros,
          e não move o foco (WCAG 2.2 SC 4.1.3) — quem revisa chega quando quiser. */}
      <div
        className="cds-report-drafts-live"
        role="status"
        aria-live="polite"
        aria-label={t('report.draftsRegion')}
      >
        {sttPhase === 'done' && toReview > 0 ? t('report.draftsReady', { count: toReview }) : ''}
      </div>
      {waiting ? (
        <PreparingSession
          eyebrow={t('report.transcribingEyebrow')}
          line={t('report.transcribing')}
        />
      ) : null}
      {(waiting ? [] : rows).map(({ slot, header, num }) => {
        const path = voiceAnswerPath(slot);
        return (
          <div key={path}>
            {header ? (
              <div className="cds-report-blockhead">
                <span
                  className="cds-report-blockhead-dot"
                  aria-hidden="true"
                  style={{
                    background: `radial-gradient(circle at 34% 30%, ${header.color.lit} 0%, ${header.color.base} 70%)`,
                  }}
                />
                <span className="cds-report-blockhead-eyebrow" style={{ color: header.color.deep }}>
                  {header.eyebrow}
                </span>
                <span className="cds-report-blockhead-rule" aria-hidden="true" />
              </div>
            ) : null}
            <ReportCard
              slot={slot}
              num={num}
              typed={readAnswer(mapped.mapping, slot)}
              note={readAnswer(mapped.mapping, noteSlot(slot))}
              hasVoice={voiceSet.has(path)}
              skipped={isSkipped(mapped.mapping, slot)}
              voicePending={recorder !== null && !voiceChecked.has(path)}
              durationSec={voiceDurations.get(path)}
              onTyped={(text) => writeTyped(slot, text)}
              onNote={(text) => writeNote(slot, text)}
              playing={playingPath === path}
              opening={openingPath === path}
              onStopPlay={() => recorder?.stopPlayback()}
              onPlay={() => {
                if (!recorder) return;
                setOpeningPath(path);
                // falha ao abrir (rede): a espera não pode ficar presa
                void recorder.play(path).catch(() => setOpeningPath(null));
              }}
              sttPhase={stt ? sttPhase : 'idle'}
              draft={drafts[path]}
              // o transcript em revisão começa no que a máquina ouviu e passa a viver
              // na chave reservada assim que alguém encosta nele
              draftText={readAnswer(mapped.mapping, draftSrcSlot(slot))}
              onDraftText={(text) => writeDraftSrc(slot, text)}
              onConfirmDraft={() =>
                confirmDraft(slot, readAnswer(mapped.mapping, draftSrcSlot(slot)))
              }
              onRetryDraft={retry}
            />
          </div>
        );
      })}
    </section>
  );
}

export default Report;
