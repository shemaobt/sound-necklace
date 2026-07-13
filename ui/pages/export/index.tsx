import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SessionStore } from '../../../adapters/sessions';
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
import { Necklace, type NecklaceSegment } from '../../organisms';
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
  /** Fronteira de download; default grava um Blob no browser. */
  saveBytes?: (filename: string, bytes: string) => void;
}

type Phase = 'loading' | 'edit' | 'saved';

interface Custody {
  meta: SessionMeta;
  voice: Set<string>;
}

const DEFAULT_META: SessionMeta = {
  granularityLevel: 'media',
  bucketAudioId: '',
  voice: [],
  pipelineConsent: true,
};

const NO_DOWNLOADS: ArtifactDownloads = { retorno: false, manifesto: false, relatorio: false };

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
  if (kind === 'retorno') return retornoFilename(slug);
  if (kind === 'manifesto') return manifestoFilename(slug);
  return relatorioFilename(slug);
}

export function Export({ store, sessionId, saveBytes = domSaveBytes }: ExportProps) {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const [phase, setPhase] = useState<Phase>(store && sessionId ? 'loading' : 'edit');
  const [custody, setCustody] = useState<Custody | null>(null);
  const [downloaded, setDownloaded] = useState<ArtifactDownloads>(NO_DOWNLOADS);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!store || !sessionId) return;
    let alive = true;
    void (async () => {
      let meta = DEFAULT_META;
      let voice = new Set<string>();
      let concluida = false;
      try {
        concluida = (await store.get(sessionId)).status === 'concluida';
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
            manifesto: serializeArtifact(buildManifesto(session)),
            retorno: serializeArtifact(buildRetorno(session)),
            relatorio: buildMapReport(session, custody?.voice ?? new Set<string>()),
          }
        : null,
    [session, custody],
  );

  if (!session) return null;
  const { canExport, semFim } = retornoExportStatus(session);

  const onDownload = async (kind: ArtifactKind): Promise<void> => {
    if (!triple) return;
    if (kind === 'retorno' && !canExport) {
      setNotice(t('export.retornoBlocked'));
      return;
    }
    if (kind === 'manifesto' && !canExportManifesto(session)) return;
    // §10.5: já concluída, o download REUSA os bytes guardados (sem rebuild); antes
    // de concluir, baixa a prévia construída da sessão viva.
    const bytes =
      phase === 'saved' && store && sessionId
        ? (await store.getArtifacts(sessionId))[kind]
        : triple[kind];
    setNotice(null);
    saveBytes(filenameFor(kind, session.slug), bytes);
    setDownloaded((d) => ({ ...d, [kind]: true }));
  };

  const onComplete = async (): Promise<void> => {
    if (!store || !sessionId || !triple || !canExport) return;
    await store.complete(sessionId, toSessionDto(session, custody?.meta ?? DEFAULT_META), triple);
    setNotice(null);
    setPhase('saved');
  };

  const onReopen = async (): Promise<void> => {
    if (!store || !sessionId) return;
    await store.reopen(sessionId);
    sessionStore.getState().setReview(false);
    setDownloaded(NO_DOWNLOADS);
    setPhase('edit');
  };

  return (
    <section className="cds-export">
      <p className="cds-export-headline" data-role="instruction">
        {t('export.headline')}
      </p>

      <div className="cds-export-stage">
        <Necklace
          totalBeads={session.totalBeads}
          beadSec={session.beadSec}
          segments={segments}
          lockedEndBeads={lockedEndBeads}
          transportOnly
        />
      </div>

      {phase !== 'loading' ? (
        <>
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
              <Button variant="ghost" onClick={onReopen}>
                {t('export.reopen')}
              </Button>
            ) : (
              <Button variant="dark" disabled={!canExport} onClick={onComplete}>
                {t('export.complete')}
              </Button>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

export default Export;
