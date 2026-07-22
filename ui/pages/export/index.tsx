import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SessionStore } from '../../../adapters/sessions';
import type { UiSound } from '../../../adapters/ui-sound';
import {
  type ArtifactTriple,
  buildManifesto,
  buildMapReport,
  buildRetorno,
  canExportManifesto,
  manifestoFilename,
  relatorioFilename,
  retornoExportStatus,
  retornoFilename,
  type SessionMeta,
  serializeArtifact,
  toSessionDto,
} from '../../../contracts';
import { Button } from '../../atoms';
import { scenePalette } from '../../tokens';
import {
  ArtifactCards,
  type ArtifactDownloads,
  type ArtifactKind,
} from '../../organisms/artifact-cards/artifact-cards';
import { Necklace, type NecklaceSegment, PreparingSession, SIZE_EXPORT } from '../../organisms';
import { sessionStore, useSessionStore } from '../../state';
import './export.css';

/**
 * Export/Completion — "Guardar os documentos" (PRD v2 §8.8, redesign §6.7): o colar
 * inteiro sob "A história está inteira no colar.", os três document cards em
 * linguagem humana, e a conclusão que produz o trio de artefatos UMA vez via os
 * builders de contracts/ e o entrega opaco ao SessionStore (§10.5 — os bytes que
 * saem dos builders SÃO o artefato; os downloads reusam esses mesmos bytes).
 *
 * Gates espelhados da referência: o retorno exige a história confirmada
 * ("Confirme o colar antes de exportar.") e avisa quantas frases ficaram sem fim
 * travado; o manifesto exige grade. Ao revisitar uma sessão concluída a tela abre
 * em revisão — "Destravar para editar" reabre (SessionStore.reopen) e a próxima
 * conclusão re-materializa os artefatos.
 *
 * Camada de wiring: recebe a porta SessionStore + o id por prop (o shell os liga
 * quando a estação passa a ser alcançável — follow-up ENG). O download real
 * (Blob/anchor) é a fronteira de sistema `saveBytes`, injetável nos testes.
 */
export interface ExportProps {
  store?: SessionStore;
  sessionId?: string;
  /** A voz da UI (§9): guardar um documento soa; um bloqueado recusa. */
  sound?: UiSound;
  /** Fronteira de download; default grava um Blob no browser. */
  saveBytes?: (filename: string, bytes: string) => void;
}

type Phase = 'loading' | 'edit' | 'saved';

interface Custody {
  meta: SessionMeta;
  voice: Set<string>;
}

const DEFAULT_META: SessionMeta = {
  granularityLevel: 'medium',
  bucketAudioId: '',
  voice: [],
  pipelineConsent: true,
};

const NO_DOWNLOADS: ArtifactDownloads = { anchoring: false, manifest: false, report: false };

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

function filenameFor(kind: ArtifactKind, slug: string): string {
  if (kind === 'anchoring') return retornoFilename(slug);
  if (kind === 'manifest') return manifestoFilename(slug);
  return relatorioFilename(slug);
}

export function Export({ store, sessionId, sound, saveBytes = domSaveBytes }: ExportProps) {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const [phase, setPhase] = useState<Phase>(store && sessionId ? 'loading' : 'edit');
  const [custody, setCustody] = useState<Custody | null>(null);
  const [downloaded, setDownloaded] = useState<ArtifactDownloads>(NO_DOWNLOADS);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!store || !sessionId) return;
    let alive = true;
    void (async () => {
      let meta = DEFAULT_META;
      let voice = new Set<string>();
      let concluida = false;
      try {
        concluida = (await store.get(sessionId)).status === 'completed';
        const dto = await store.load(sessionId);
        meta = {
          granularityLevel: dto.granularityLevel,
          bucketAudioId: dto.bucketAudioId,
          voice: dto.voice,
          pipelineConsent: dto.pipelineConsent,
        };
        voice = new Set(dto.voice);
      } catch {
        // sessão inacessível pela store ou estado nunca salvo — defaults editáveis,
        // sem travar em "loading" (o guard cobre o get, não só o load)
      }
      if (!alive) return;
      setCustody({ meta, voice });
      setPhase(concluida ? 'saved' : 'edit');
    })();
    return () => {
      alive = false;
    };
  }, [store, sessionId]);

  const segments = useMemo<NecklaceSegment[]>(
    () =>
      (session?.parts ?? []).flatMap((p, i) =>
        p.locked && p.span ? [{ span: p.span, tint: scenePalette[i % scenePalette.length]! }] : [],
      ),
    [session],
  );
  const lockedEndBeads = useMemo<number[]>(
    () => (session?.parts ?? []).flatMap((p) => (p.locked && p.span ? [p.span.e] : [])),
    [session],
  );

  const triple = useMemo<ArtifactTriple | null>(
    () =>
      session
        ? {
            manifest: serializeArtifact(buildManifesto(session)),
            anchoring: serializeArtifact(buildRetorno(session)),
            report: buildMapReport(session, custody?.voice ?? new Set<string>()),
          }
        : null,
    [session, custody],
  );

  if (!session) return null;
  // enquanto a tela de guardar carrega, a espera oliva do protótipo (ENG-312/redesign):
  // "Guardando · Reunindo as decisões de vocês nos documentos…", não o palco meio montado.
  if (phase === 'loading') {
    return <PreparingSession eyebrow={t('export.waitEyebrow')} line={t('export.waitLine')} />;
  }
  const { canExport, semFim } = retornoExportStatus(session);

  const onDownload = async (kind: ArtifactKind): Promise<void> => {
    if (!triple) return;
    if (kind === 'anchoring' && !canExport) {
      setNotice(t('export.anchoringBlocked'));
      sound?.refuse();
      return;
    }
    if (kind === 'manifest' && !canExportManifesto(session)) return;
    // Fronteira de IO real (ENG-247): já concluída, o download busca os bytes
    // guardados na API (§10.5 — sem rebuild); a falha vira aviso, nunca silêncio.
    let bytes: string;
    try {
      bytes =
        phase === 'saved' && store && sessionId
          ? (await store.getArtifacts(sessionId))[kind]
          : triple[kind];
    } catch {
      setNotice(t('export.downloadError'));
      sound?.refuse();
      return;
    }
    setNotice(null);
    sound?.saved();
    saveBytes(filenameFor(kind, session.slug), bytes);
    setDownloaded((d) => ({ ...d, [kind]: true }));
  };

  // Fronteira da AÇÃO mais importante do produto (§8.8): concluir são 3 requests
  // reais em sequência — a falha (rede, 409 de lease trocando no meio) precisa
  // reabilitar o botão e orientar; o segundo clique costuma resolver (§9: nunca
  // punir). `busy` fecha o duplo-clique enquanto a sequência voa.
  const onComplete = async (): Promise<void> => {
    if (!store || !sessionId || !triple || !canExport || busy) return;
    setBusy(true);
    try {
      await store.complete(sessionId, toSessionDto(session, custody?.meta ?? DEFAULT_META), triple);
      setNotice(null);
      sound?.advance();
      setPhase('saved');
    } catch {
      setNotice(t('export.saveError'));
      sound?.refuse();
    } finally {
      setBusy(false);
    }
  };

  const onReopen = async (): Promise<void> => {
    if (!store || !sessionId || busy) return;
    setBusy(true);
    try {
      await store.reopen(sessionId);
      sessionStore.getState().setReview(false);
      setDownloaded(NO_DOWNLOADS);
      setPhase('edit');
      setNotice(null);
    } catch {
      setNotice(t('export.reopenError'));
      sound?.refuse();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cds-export">
      <p className="cds-export-headline" data-role="instruction">
        {t('export.headline')}
      </p>

      <div className="cds-export-stage">
        <Necklace
          size={SIZE_EXPORT}
          totalBeads={session.totalBeads}
          beadSec={session.beadSec}
          segments={segments}
          lockedEndBeads={lockedEndBeads}
          transportOnly
        />
      </div>

      {phase === 'edit' && semFim > 0 ? (
        <p className="cds-export-warning" role="status">
          {t('export.semFim', { n: semFim })}
        </p>
      ) : null}

      <ArtifactCards downloaded={downloaded} onDownload={onDownload} />

      {notice ? (
        <p className="cds-export-notice" role="alert">
          {notice}
        </p>
      ) : null}

      <div className="cds-export-action" data-role="primary-action">
        {phase === 'saved' ? (
          // key: o swap dark→ghost NUNCA reaproveita o <button> — reaproveitado, a
          // transição de background-color fica presa no valor inicial (oliva) e o
          // rótulo some (oliva sobre oliva).
          <Button key="reopen" variant="ghost" onClick={onReopen}>
            {t('export.reopen')}
          </Button>
        ) : (
          // guardar leva 3 requests reais: o estado vive no botão (ENG-324) —
          // 'Guardando…' desabilitado até o persist confirmar; cliques repetidos morrem
          <Button key="complete" variant="dark" disabled={!canExport || busy} onClick={onComplete}>
            {busy ? t('export.saving') : t('export.complete')}
          </Button>
        )}
      </div>
    </section>
  );
}

export default Export;
