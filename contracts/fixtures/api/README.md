# fixtures/api — dados PROVISÓRIOS (ENG-235)

`bucket-list.json` é a listagem do bucket que os **adapters-fixture** consomem
(ENG-241 `adapters/bucket`) e que valida contra `BucketListResponseSchema`.

- **Fonte:** PRD-derivada, NÃO da referência v1 (o bucket é surface v2-nova, §7.4).
- Três entradas cobrem os casos: dois áudios **com** envelope de acousteme +
  consentimento presente, e um **sem** acousteme (`null`) e sem consentimento
  (`consent_present: false`) — os dois eixos que a setup precisa exercitar (§6.1, §12/O6).
- O `acousteme` de cada áudio traz a grade uniforme do tokenizador: `hop_sec: 0.02` e
  `granularity_frames { small: 10, medium: 25, large: 50 }` (§6.1/§15.2 O8, resolvido —
  tripod-api PR #100), da qual o GranularityResolver deriva `beadSec = frames[nível] × hop_sec`.
  Sem mais `data` opaco: o `AcoustemeEnvelopeSchema` (contracts/bucket.ts) valida esses campos.

Os bytes WAV reais desses áudios (por `id`) entram em `fixtures/bucket/` no ENG-241.
