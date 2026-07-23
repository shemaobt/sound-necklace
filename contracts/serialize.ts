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

/**
 * Nomes de arquivo dos artefatos — INGLÊS desde a ENG-359, divergindo dos nomes
 * PT-BR da referência (`<slug>-manifesto-contas.json`, L1331/L1336). O `kind` da
 * API (`manifest`/`anchoring`/`report`) segue sendo o identificador; o nome é
 * rótulo de download e chave de armazenamento. ⚠️ O `tripod-api` e o Compilador
 * ainda esperam os nomes antigos — ver ENG-358/ENG-359.
 *
 * O fallback de slug vazio ("story") é único para os três, também da ENG-359: a
 * referência divergia ("colar" nos JSONs, "historia" no .md, L1152) e o quirk
 * não sobreviveu à renomeação. Quase morto na prática — `segment()` garante
 * slug. O fallback é SÓ de nome de arquivo: o `story_slug` dentro do retorno é
 * o slug cru.
 */
export function manifestoFilename(slug: string): string {
  return `${slug || 'story'}-bead-manifest.json`;
}

export function retornoFilename(slug: string): string {
  return `${slug || 'story'}-anchoring-return.json`;
}
