# fixtures/api — dados PROVISÓRIOS (ENG-235)

`bucket-list.json` é a listagem do bucket que os **adapters-fixture** consomem
(ENG-241 `adapters/bucket`) e que valida contra `BucketListResponseSchema`.

- **Fonte:** PRD-derivada, NÃO da referência v1 (o bucket é surface v2-nova, §7.4).
- Três entradas cobrem os casos: dois áudios **com** envelope de acousteme +
  consentimento presente, e um **sem** acousteme (`null`) e sem consentimento
  (`consent_present: false`) — os dois eixos que a setup precisa exercitar (§6.1, §12/O6).
- O conteúdo de `acousteme.data` é **fixture-authored e provisório** (a semântica O8
  está em aberto): traz `bead_sec` por nível só para o stub do GranularityResolver ler
  (ENG-241). O schema mantém `data` opaco — nada aqui é imposto pelo contrato.

Os bytes WAV reais desses áudios (por `id`) entram em `fixtures/bucket/` no ENG-241.
