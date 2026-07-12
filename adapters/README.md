# adapters/ — portas e implementações trocáveis

Cada adapter: uma interface (porta) + implementação real + **modo fixture**
(o app inteiro roda sem API real) + `register.ts` (auto-registro via
`import.meta.glob` do composition root — convenção da ENG-224, detalhes em
`docs/architecture.md`). Adapters podem importar `domain/` e `contracts/`;
nunca `ui/`. Fixture é o default; o modo real liga por configuração de ambiente.

Issues: audio (ENG-217) · connectivity (ENG-224) · api/auth (ENG-239) ·
sessions (ENG-240) · bucket + granularity (ENG-241; regra O8 resolvida na ENG-242) ·
voice (ENG-244) · tts (ENG-251).
