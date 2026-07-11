# fixtures/bucket — áudios do bucket + payloads de acoustemas

Entradas de áudio do bucket do projeto usadas pelos adapters em modo fixture
(PRD v2 §7.4): cada entrada = um WAV pequeno + um JSON com o envelope de
acoustemas (`{version, data}` — forma provisória até O8 fechar, PRD §15.2) e a
flag de consentimento de coleta (O6).

Preenchido pela **ENG-241** (BucketSource + GranularityResolver stub) com 3
entradas; a **ENG-253** adicionou mais duas (`fluxo-minimo.wav`,
`costura-pequena.wav`) com o PCM sintético dos casos golden `minimal-flow` e
`seam-small-move` (mesmo PcmSpec → mesmo `manifest_id`) e `bead_sec.media = 0.5`,
para dirigir a UI real e provar identidade byte a byte do export. Nunca comitar
áudio real de comunidade aqui — apenas áudio sintético ou gravações próprias de
teste (LGPD, PRD §12).
