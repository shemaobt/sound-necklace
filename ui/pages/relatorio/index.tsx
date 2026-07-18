import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { VoiceRecorder } from '../../../adapters/voice/types';
import {
  type AnswerSlot,
  ensureMapping,
  type Mapping,
  type QuestionSlot,
  questionSequence,
  setAnswer,
  voiceAnswerPath,
} from '../../../domain';
import { questionTextFor } from '../../i18n/mapeamento-questions';
import { Button, WaveformBar } from '../../atoms';
import { sessionStore, useSessionStore } from '../../state';
import './relatorio.css';

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

export interface RelatorioProps {
  recorder?: VoiceRecorder | null;
  preloaded?: PreloadedVoice;
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const SECTION_KEY: Record<1 | 2 | 3, string> = {
  1: 'relatorio.sectionStory',
  2: 'relatorio.sectionScenes',
  3: 'relatorio.sectionPhrases',
};

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
  section: string | null;
  group: string | null;
}

/** Insere os cabeçalhos de seção (nível) e de grupo (cena/frase) na sequência. */
function toRows(sequence: QuestionSlot[], t: Translate): Row[] {
  const rows: Row[] = [];
  let level = 0;
  let group = '';
  let sceneN = 0;
  let fraseN = 0;
  for (const slot of sequence) {
    const section = slot.level !== level ? t(SECTION_KEY[slot.level]) : null;
    if (section) {
      level = slot.level;
      group = '';
    }
    const gid = slot.level === 2 ? slot.partId : slot.level === 3 ? slot.propId : '';
    let groupLabel: string | null = null;
    if (gid && gid !== group) {
      group = gid;
      groupLabel =
        slot.level === 2
          ? t('relatorio.groupScene', { n: (sceneN += 1) })
          : t('relatorio.groupPhrase', { n: (fraseN += 1) });
    }
    rows.push({ slot, section, group: groupLabel });
  }
  return rows;
}

/** Marcador de papel do protótipo: a pergunta que a facilitadora conduz. SVG inline,
 *  nunca unicode — um emoji renderiza diferente em cada sistema e não é da marca. */
function NotebookGlyph() {
  return (
    <svg
      className="cds-relatorio-role-glyph"
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
      className="cds-relatorio-add-note-glyph"
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
    <div className="cds-relatorio-card">
      {/* cabeçalho do protótipo: numeral areia · pergunta · marcador de papel */}
      <div className="cds-relatorio-head">
        <span className="cds-relatorio-num" aria-hidden="true">
          Q{num}
        </span>
        <p className="cds-relatorio-q">{questionTextFor(slot, i18n.language)}</p>
        {facilitatorLed ? (
          <span
            className="cds-relatorio-role"
            role="img"
            aria-label={t('relatorio.facilitatorLed')}
            title={t('relatorio.facilitatorLed')}
          >
            <NotebookGlyph />
          </span>
        ) : null}
      </div>

      {voiceOnly ? (
        <div className="cds-relatorio-voice">
          <Button
            variant="ghost"
            size="sm"
            disabled={opening}
            onClick={playing ? onStopPlay : onPlay}
          >
            {opening
              ? t('relatorio.openingAnswer')
              : playing
                ? t('relatorio.pauseAnswer')
                : t('relatorio.playAnswer')}
          </Button>
          <span className="cds-relatorio-wave" aria-hidden="true">
            {WAVE_HEIGHTS.map((h, i) => (
              <WaveformBar key={i} height={h} active={playing} />
            ))}
          </span>
          <span className="cds-relatorio-duration" aria-label={t('relatorio.answerDuration')}>
            {durationSec === undefined ? '—' : formatDuration(durationSec)}
          </span>
        </div>
      ) : pendingRow ? (
        // procurando a gravação: a onda apagada segura o lugar — nunca o vazio
        <div
          className="cds-relatorio-voice is-pending"
          role="status"
          aria-label={t('relatorio.voicePending')}
        >
          <span className="cds-relatorio-wave" aria-hidden="true">
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
        className="cds-relatorio-typed"
        aria-label={t('relatorio.answer')}
        rows={1}
        placeholder={
          voiceOnly || pendingRow ? t('relatorio.writeAnswer') : t('relatorio.noAnswerYet')
        }
        value={typed}
        onChange={(e) => onTyped(e.target.value)}
      />

      {showNote ? (
        <textarea
          className="cds-relatorio-note"
          aria-label={t('relatorio.typedAria')}
          rows={2}
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
      ) : (
        // link de texto com "+", não pílula (protótipo noteClosed): é um convite
        // discreto, e uma pílula por cartão competia com a pergunta
        <button type="button" className="cds-relatorio-add-note" onClick={() => setShowNote(true)}>
          <PlusGlyph />
          {t('relatorio.addNote')}
        </button>
      )}
    </div>
  );
}

export function Relatorio({ recorder = null, preloaded }: RelatorioProps) {
  const { t } = useTranslation();
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

  const rows = toRows(sequence, t);

  const writeTyped = (slot: QuestionSlot, text: string): void => {
    sessionStore.getState().apply((s) => setAnswer(s.mapping ? s : ensureMapping(s), slot, text));
  };
  const writeNote = (slot: QuestionSlot, text: string): void => {
    sessionStore
      .getState()
      .apply((s) => setAnswer(s.mapping ? s : ensureMapping(s), noteSlot(slot), text));
  };

  return (
    <section className="cds-relatorio">
      <header className="cds-relatorio-header">
        <p className="cds-relatorio-eyebrow">{t('relatorio.eyebrow')}</p>
        <p className="cds-relatorio-headline">{t('relatorio.headline')}</p>
      </header>
      {rows.map(({ slot, section, group }, i) => {
        const path = voiceAnswerPath(slot);
        return (
          <div key={path}>
            {section ? <h2 className="cds-relatorio-section">{section}</h2> : null}
            {group ? <p className="cds-relatorio-group">{group}</p> : null}
            <ReportCard
              slot={slot}
              num={i + 1}
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

export default Relatorio;
