# fixtures/bucket — áudios do bucket + payloads de acoustemas

Entradas de áudio do bucket do projeto usadas pelos adapters em modo fixture
(PRD v2 §7.4): cada entrada = um WAV pequeno + um JSON com o envelope de
acoustemas (`{version, hop_sec, granularity_frames}` — a grade do tokenizador que
resolve a granularidade, §6.1/§15.2 O8) e a
flag de consentimento de coleta (O6).

Preenchido pela **ENG-241** (BucketSource + GranularityResolver) com 3
entradas; a **ENG-253** adicionou mais duas (`fluxo-minimo.wav`,
`costura-pequena.wav`) com o PCM sintético dos casos golden `minimal-flow` e
`seam-small-move` (mesmo PcmSpec → mesmo `manifest_id`) e a grade uniforme do
tokenizador (`granularity_frames.medium = 25` × `hop_sec 0.02` → Média = 0.5 s),
para dirigir a UI real e provar identidade byte a byte do export. Nunca comitar
áudio real de comunidade aqui — apenas áudio sintético ou gravações próprias de
teste (LGPD, PRD §12).
