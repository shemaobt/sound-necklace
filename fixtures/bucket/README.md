# fixtures/bucket — áudios do bucket + payloads de acoustemas

Entradas de áudio do bucket do projeto usadas pelos adapters em modo fixture
(PRD v2 §7.4): cada entrada = um WAV pequeno + um JSON com o envelope de
acoustemas (`{version, hop_sec, granularity_frames}` — a grade do tokenizador que
resolve a granularidade, §6.1/§15.2 O8) e a
flag de consentimento de coleta (O6).

Preenchido pela **ENG-241** (BucketSource + GranularityResolver) com 3
entradas; a **ENG-253** adicionou mais duas (`fluxo-minimo.wav`,
`costura-pequena.wav`), que herdaram nome e PcmSpec dos casos do harness dourado
`minimal-flow` e `seam-small-move` (o harness saiu na ENG-691), mais a grade
uniforme do tokenizador (`granularity_frames.medium = 25` × `hop_sec 0.02` →
Média = 0.5 s). O e2e continua dirigindo a UI real com elas. Nunca comitar
áudio real de comunidade aqui — apenas áudio sintético ou gravações próprias de
teste (LGPD, PRD §12).
