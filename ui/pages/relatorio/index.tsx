import { useEffect, useMemo, useState } from 'react';

import type { VoiceRecorder } from '../../../adapters/voice/types';
import {
  buildMapReport,
  buildRetorno,
  relatorioFilename,
  retornoFilename,
  serializeArtifact,
} from '../../../contracts';
import {
  type AnswerSlot,
  ensureMapping,
  type Mapping,
  type QuestionSlot,
  questionSequence,
  setAnswer,
  voiceAnswerPath,
} from '../../../domain';
import { Button, WaveformBar } from '../../atoms';
import { sessionStore, useSessionStore } from '../../state';
import './relatorio.css';

/**
 * A estação Relatório (PRD v2 §8.7 "The report", redesign §6.6): o artefato
 * consolidado e EDITÁVEL. Um cartão por pergunta na ordem que o domínio produz
 * (`questionSequence`); cada cartão traz a resposta digitada editável, ou — quando
 * a resposta existe só como gravação — a linha de voz (▶ + forma de onda + duração),
 * ou o vazio "ainda sem resposta gravada". Perguntas conduzidas pela facilitadora
 * levam um marcador de papel. O `.md` sai byte-idêntico ao contrato
 * (`buildMapReport`), e o atalho da ancoragem (.json) respeita o gate da história
 * confirmada — 1:1 do `renderMapReport` da referência (L1136–1154).
 *
 * Superfície FACILITADORA (§7.2): dígitos e IDs são permitidos aqui (≠ telas do
 * ouvinte). Camada de wiring: recebe a porta `VoiceRecorder` (playback das
 * respostas) e a fronteira de download `saveBytes` por prop; nada de domínio/
 * contracts muda. As edições de texto passam por `setAnswer` (store preguiçoso).
 *
 * A nota da facilitadora ("acrescentar uma observação") vive no answer store sob
 * uma chave reservada `nota__<k>` no MESMO bucket da resposta: persiste no autosave
 * e no round-trip do DTO (buckets são `record<string,string>` livres), mas
 * `buildMapReport` só emite as chaves das perguntas → a nota NUNCA sai no `.md`
 * (§10.4: o esqueleto congelado não tem linhas de nota).
 */
export interface RelatorioProps {
  recorder?: VoiceRecorder | null;
  /** Fronteira de download; default grava um Blob no browser. */
  saveBytes?: (filename: string, bytes: string) => void;
}

const SECTION: Record<1 | 2 | 3, string> = {
  1: 'A história',
  2: 'As cenas',
  3: 'As frases',
};

/** Prefixo da chave reservada da nota — fora do vocabulário de perguntas. */
const NOTE_PREFIX = 'nota__';

/** Alturas fixas das barras decorativas da linha de voz (px). */
const WAVE_HEIGHTS = [6, 12, 20, 14, 22, 10, 16, 8];

function domSaveBytes(filename: string, bytes: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
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
function toRows(sequence: QuestionSlot[]): Row[] {
  const rows: Row[] = [];
  let level = 0;
  let group = '';
  let sceneN = 0;
  let fraseN = 0;
  for (const slot of sequence) {
    const section = slot.level !== level ? SECTION[slot.level] : null;
    if (section) {
      level = slot.level;
      group = '';
    }
    const gid = slot.level === 2 ? slot.partId : slot.level === 3 ? slot.propId : '';
    let groupLabel: string | null = null;
    if (gid && gid !== group) {
      group = gid;
      groupLabel = slot.level === 2 ? `Cena ${(sceneN += 1)}` : `Frase ${(fraseN += 1)}`;
    }
    rows.push({ slot, section, group: groupLabel });
  }
  return rows;
}

interface ReportCardProps {
  slot: QuestionSlot;
  typed: string;
  note: string;
  hasVoice: boolean;
  onTyped: (text: string) => void;
  onNote: (text: string) => void;
  onPlay: () => void;
}

function ReportCard({ slot, typed, note, hasVoice, onTyped, onNote, onPlay }: ReportCardProps) {
  const [showNote, setShowNote] = useState(note !== '');
  const q = slot.question;
  const facilitatorLed = slot.k === 'ausencia';
  const voiceOnly = hasVoice && !typed.trim();

  return (
    <div className="cds-relatorio-card">
      {facilitatorLed ? (
        <span className="cds-relatorio-role" role="img" aria-label="conduzida pela facilitadora">
          🎙
        </span>
      ) : null}

      <p className="cds-relatorio-q">
        {q.q}
        {q.field ? <span className="cds-relatorio-field"> ({q.field})</span> : null}
      </p>

      {voiceOnly ? (
        <div className="cds-relatorio-voice">
          <Button variant="ghost" size="sm" onClick={onPlay}>
            ▶ ouvir a resposta
          </Button>
          <span className="cds-relatorio-wave" aria-hidden="true">
            {WAVE_HEIGHTS.map((h, i) => (
              <WaveformBar key={i} height={h} />
            ))}
          </span>
          <span className="cds-relatorio-duration" aria-label="duração da resposta">
            —
          </span>
        </div>
      ) : null}

      <textarea
        className="cds-relatorio-typed"
        aria-label="resposta"
        placeholder={voiceOnly ? undefined : 'ainda sem resposta gravada'}
        value={typed}
        onChange={(e) => onTyped(e.target.value)}
      />

      {showNote ? (
        <textarea
          className="cds-relatorio-note"
          aria-label="observação da facilitadora"
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setShowNote(true)}>
          acrescentar uma observação
        </Button>
      )}
    </div>
  );
}

export function Relatorio({ recorder = null, saveBytes = domSaveBytes }: RelatorioProps) {
  const session = useSessionStore((s) => s.session);
  const [voiceSet, setVoiceSet] = useState<ReadonlySet<string>>(new Set());

  // Visão de LEITURA com o answer store garantido mesmo antes do efeito persistir.
  const mapped = useMemo(() => {
    if (!session) return null;
    return session.mapping ? session : ensureMapping(session);
  }, [session]);
  const sequence = useMemo(() => (mapped ? questionSequence(mapped) : []), [mapped]);

  useEffect(() => {
    if (session && !session.mapping) sessionStore.getState().apply((s) => ensureMapping(s));
  }, [session]);

  // Descobre quais respostas TÊM gravação (define a linha de voz e alimenta o
  // `voice` do `buildMapReport` para que o .md referencie a gravação, §10.4).
  useEffect(() => {
    // Sem recorder não há gravação a descobrir: o estado inicial já é vazio (sem
    // setState síncrono no efeito — react-hooks/set-state-in-effect).
    if (!recorder) return;
    let alive = true;
    const paths = sequence.map((s) => voiceAnswerPath(s));
    void Promise.all(paths.map((p) => recorder.has(p).then((h) => (h ? p : null)))).then((res) => {
      if (alive) setVoiceSet(new Set(res.filter((p): p is string => p !== null)));
    });
    return () => {
      alive = false;
    };
  }, [recorder, sequence]);

  if (!session || !mapped || !sequence.length) return null;

  const rows = toRows(sequence);
  const confirmed = mapped.whole.confirmed;

  const writeTyped = (slot: QuestionSlot, text: string): void => {
    sessionStore.getState().apply((s) => setAnswer(s.mapping ? s : ensureMapping(s), slot, text));
  };
  const writeNote = (slot: QuestionSlot, text: string): void => {
    sessionStore
      .getState()
      .apply((s) => setAnswer(s.mapping ? s : ensureMapping(s), noteSlot(slot), text));
  };

  const onDownloadReport = (): void => {
    saveBytes(relatorioFilename(mapped.slug), buildMapReport(mapped, voiceSet));
  };
  const onDownloadRetorno = (): void => {
    if (!confirmed) return;
    saveBytes(retornoFilename(mapped.slug), serializeArtifact(buildRetorno(mapped)));
  };

  return (
    <section className="cds-relatorio">
      {rows.map(({ slot, section, group }) => {
        const path = voiceAnswerPath(slot);
        return (
          <div key={path}>
            {section ? <h2 className="cds-relatorio-section">{section}</h2> : null}
            {group ? <p className="cds-relatorio-group">{group}</p> : null}
            <ReportCard
              slot={slot}
              typed={readAnswer(mapped.mapping, slot)}
              note={readAnswer(mapped.mapping, noteSlot(slot))}
              hasVoice={voiceSet.has(path)}
              onTyped={(text) => writeTyped(slot, text)}
              onNote={(text) => writeNote(slot, text)}
              onPlay={() => recorder && void recorder.play(path)}
            />
          </div>
        );
      })}

      <div className="cds-relatorio-nav">
        <Button variant="primary" size="sm" onClick={onDownloadReport}>
          Baixar relatório (.md)
        </Button>
        <Button variant="ghost" size="sm" disabled={!confirmed} onClick={onDownloadRetorno}>
          Baixar a ancoragem (.json)
        </Button>
      </div>
    </section>
  );
}

export default Relatorio;
