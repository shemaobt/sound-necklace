# fixtures/bucket — áudios do bucket + payloads de acoustemas

Entradas de áudio do bucket do projeto usadas pelos adapters em modo fixture
(PRD v2 §7.4): cada entrada = um WAV pequeno + um JSON com o envelope de
acoustemas (`{version, data}` — forma provisória até O8 fechar, PRD §15.2) e a
flag de consentimento de coleta (O6).

Preenchido pela **ENG-241** (BucketSource + GranularityResolver stub) com 2–3
entradas; a **ENG-253** adiciona a entrada de PCM sintético espelhando um caso
dourado. Nunca comitar áudio real de comunidade aqui — apenas áudio sintético
ou gravações próprias de teste (LGPD, PRD §12).
