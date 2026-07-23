import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AnswerDraft, Transcriber } from '../../../adapters/stt/types';
import type { VoiceRecorder } from '../../../adapters/voice/types';
import {
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
import { Button, WaveformBar } from '../../atoms';
import type { PaletteEntry } from '../../tokens';
import { type BlockLabels, blockEyebrow } from '../conversation/trechos';
import { sessionStore, useSessionStore } from '../../state';
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
}

/** Prefixo da chave reservada da nota — fora do vocabulário de perguntas. */
const NOTE_PREFIX = 'nota__';

/** Alturas fixas das barras decorativas da linha de voz (px). */
const WAVE_HEIGHTS = [6, 12, 20, 14, 22, 10, 16, 8];

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
const DRAFT_EN_PREFIX = 'en__';

/**
 * Versão da gravação que produziu o rascunho guardado em `en__<k>`. Precisa ser
 * DURÁVEL: voltar à entrevista para regravar desmonta o relatório, então um ref
 * em memória não sobrevive justamente à navegação que ele existe para detectar.
 */
const DRAFT_VER_PREFIX = 'enver__';

/** O slot da nota: a mesma resposta sob a chave reservada `nota__<k>`. */
function noteSlot(slot: QuestionSlot): AnswerSlot {
  return reservedSlot(slot, NOTE_PREFIX);
}

/** O slot do inglês em revisão, ainda NÃO confirmado. */
function draftEnSlot(slot: QuestionSlot): AnswerSlot {
  return reservedSlot(slot, DRAFT_EN_PREFIX);
}

/** O slot da versão de gravação a que o rascunho guardado corresponde. */
function draftVerSlot(slot: QuestionSlot): AnswerSlot {
  return reservedSlot(slot, DRAFT_VER_PREFIX);
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
 * sugestão até alguém confirmar o inglês — e é o inglês que vai ao documento.
 * Digitar à mão continua disponível o tempo todo: se o job falhar ou demorar, o
 * campo de resposta do cartão resolve sozinho (§8.7 — sem beco sem saída).
 */
function DraftReview({
  slot,
  show,
  phase,
  draft,
  draftEn,
  onDraftEn,
  onConfirm,
  onRetry,
}: {
  slot: QuestionSlot;
  show: boolean;
  phase: SttPhase;
  draft?: AnswerDraft;
  draftEn: string;
  onDraftEn?: (text: string) => void;
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
      <p className="cds-report-draft-label">{t('report.draftSource')}</p>
      <p className="cds-report-draft-source">{draft.source}</p>
      <label className="cds-report-draft-label" htmlFor={fieldId}>
        {t('report.draftEnglish')}
      </label>
      <textarea
        id={fieldId}
        className="cds-report-draft-en"
        rows={2}
        value={draftEn}
        onChange={(e) => onDraftEn?.(e.target.value)}
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
  draftEn?: string;
  onDraftEn?: (text: string) => void;
  onConfirmDraft?: () => void;
  onRetryDraft?: () => void;
}

function ReportCard({
  slot,
  num,
  typed,
  note,
  hasVoice,
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
  draftEn = '',
  onDraftEn,
  onConfirmDraft,
  onRetryDraft,
}: ReportCardProps) {
  const { t, i18n } = useTranslation();
  const [showNote, setShowNote] = useState(note !== '');
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

      {voiceOnly ? (
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
        draftEn={draftEn}
        onDraftEn={onDraftEn}
        onConfirm={onConfirmDraft}
        onRetry={onRetryDraft}
      />

      {/* A digitação vive AQUI (decisão do dono: a entrevista é só-voz). Mas o campo
          fica quieto: uma linha, sem caixa nem alça — vazio, lê-se como o
          "ainda sem resposta gravada" em itálico do protótipo, e cresce ao escrever.
          Uma caixa de 64px em cada um dos 41 cartões era um formulário, não um relato. */}
      <textarea
        className="cds-report-typed"
        aria-label={t('report.answer')}
        rows={1}
        placeholder={voiceOnly || pendingRow ? t('report.writeAnswer') : t('report.noAnswerYet')}
        value={typed}
        onChange={(e) => onTyped(e.target.value)}
      />

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
}: ReportProps) {
  const { t, i18n } = useTranslation();
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
  // começar parcial: cada crescimento redispara o job, e como só o PRIMEIRO pedido de
  // cada montagem vai sem `force`, os seguintes reprocessam de fato em vez de esbarrar
  // na idempotência do port. Esperar a descoberta inteira seria pior — um único
  // `has()` pendurado travaria a transcrição de todas as outras.
  // ponytail: reprocessa algumas vezes na abertura; se custar caro na API real,
  // segurar o disparo por ~1s de silêncio da descoberta resolve.
  const recordedPaths = voicePaths.filter((p) => voiceSet.has(p));
  const {
    phase: sttPhase,
    drafts,
    retry,
  } = useSttDrafts(stt, sessionId, recordedPaths, recordingVersion);

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
      const seededVersion = readAnswer(m, draftVerSlot(slot));
      const known = hasAnswerKey(m, draftEnSlot(slot));
      // A chave já existe e é da MESMA gravação: houve edição humana (inclusive
      // apagá-la de propósito) e não se mexe. Se a versão MUDOU, o que está ali é a
      // tradução de um áudio descartado e precisa dar lugar ao rascunho novo.
      if (known && seededVersion === version) continue;
      sessionStore.getState().apply((s) => {
        const withEn = setAnswer(s.mapping ? s : ensureMapping(s), draftEnSlot(slot), draft.en);
        return setAnswer(withEn, draftVerSlot(slot), version);
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

  const writeTyped = (slot: QuestionSlot, text: string): void => {
    sessionStore.getState().apply((s) => setAnswer(s.mapping ? s : ensureMapping(s), slot, text));
  };
  const writeNote = (slot: QuestionSlot, text: string): void => {
    sessionStore
      .getState()
      .apply((s) => setAnswer(s.mapping ? s : ensureMapping(s), noteSlot(slot), text));
  };
  const writeDraftEn = (slot: QuestionSlot, text: string): void => {
    sessionStore
      .getState()
      .apply((s) => setAnswer(s.mapping ? s : ensureMapping(s), draftEnSlot(slot), text));
  };
  /** Confirmar: o inglês em revisão vira A resposta, pelo mesmo caminho de digitar. */
  const confirmDraft = (slot: QuestionSlot, text: string): void => {
    writeTyped(slot, text);
  };

  // Quantas respostas gravadas ainda esperam confirmação — o número que o leitor
  // de tela ouve quando os rascunhos chegam.
  const toReview = sequence.filter(
    (s) => voiceSet.has(voiceAnswerPath(s)) && !readAnswer(mapped.mapping, s).trim(),
  ).length;

  return (
    <section className="cds-report">
      <header className="cds-report-header">
        <p className="cds-report-eyebrow">{t('report.eyebrow')}</p>
        <p className="cds-report-headline">{t('report.headline')}</p>
      </header>
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
      {rows.map(({ slot, header, num }) => {
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
              // o inglês em revisão começa no que a máquina propôs e passa a viver
              // na chave reservada assim que alguém encosta nele
              draftEn={readAnswer(mapped.mapping, draftEnSlot(slot))}
              onDraftEn={(text) => writeDraftEn(slot, text)}
              onConfirmDraft={() =>
                confirmDraft(slot, readAnswer(mapped.mapping, draftEnSlot(slot)))
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
