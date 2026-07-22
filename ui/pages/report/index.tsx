import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
 * A nota da facilitadora ("acrescentar uma observação") vive no answer store sob
 * uma chave reservada `nota__<k>` no MESMO bucket da resposta: persiste no autosave
 * e no round-trip do DTO (buckets são `record<string,string>` livres), mas
 * `buildMapReport` só emite as chaves das perguntas → a nota NUNCA sai no `.md`
 * (§10.4: o esqueleto congelado não tem linhas de nota).
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

/** O slot da nota: a mesma resposta sob a chave reservada `nota__<k>`. */
function noteSlot(slot: QuestionSlot): AnswerSlot {
  const k = NOTE_PREFIX + slot.k;
  switch (slot.level) {
    case 1:
      return { level: 1, k };
    case 2:
      return { level: 2, partId: slot.partId, k };
    case 3:
      return { level: 3, propId: slot.propId, k };
  }
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
}: ReportCardProps) {
  const { t, i18n } = useTranslation();
  const [showNote, setShowNote] = useState(note !== '');
  const facilitatorLed = slot.k === 'ausencia';
  const voiceOnly = hasVoice && !typed.trim();
  const pendingRow = voicePending && !hasVoice && !typed.trim();

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

export function Report({ recorder = null, preloaded }: ReportProps) {
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

  // Descobre quais respostas TÊM gravação (define a linha de voz e alimenta o
  // `voice` do `buildMapReport` para que o .md referencie a gravação, §10.4).
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

  return (
    <section className="cds-report">
      <header className="cds-report-header">
        <p className="cds-report-eyebrow">{t('report.eyebrow')}</p>
        <p className="cds-report-headline">{t('report.headline')}</p>
      </header>
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
            />
          </div>
        );
      })}
    </section>
  );
}

export default Report;
