/**
 * O serializador único dos artefatos — port 1:1 do download() da referência
 * (docs/reference/index.html L1311–1315) e dos nomes de arquivo dos handlers
 * dlManifest/dlReturn (L1331/L1336). PRD v2 §10.5: os bytes que saem daqui SÃO
 * o artefato — nenhuma outra via de serialização pode existir no app.
 *
 * Contrato de bytes (docs/architecture.md §5): JSON.stringify(x, null, 2),
 * UTF-8 cru (não-ASCII nunca \u-escapado — spec do QuoteJSONString), sem BOM e
 * SEM newline final. Ordem de chaves = ordem de inserção (spec-mandada); a
 * formatação de números (shortest round-trip) é idêntica entre Node e Chromium
 * (ambos V8), o que fecha a byte-identidade com os goldens da referência.
 */

export function serializeArtifact(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Fallback "colar" da referência (L1331/L1336) — quase morto na prática
 *  (segment() garante slug), portado fiel. O nav do mapeamento da referência
 *  usa um SEGUNDO fallback divergente ("historia", L1152), fora deste contrato:
 *  o export-card é o normativo. O fallback é SÓ de nome de arquivo — o
 *  story_slug dentro do retorno é o slug cru. */
export function manifestoFilename(slug: string): string {
  return `${slug || 'colar'}-manifesto-contas.json`;
}

export function retornoFilename(slug: string): string {
  return `${slug || 'colar'}-retorno-ancoragem.json`;
}
