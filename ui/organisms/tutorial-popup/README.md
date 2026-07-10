# tutorial-popup

Popup de tutorial da facilitadora (PRD v2 §7.5): dicas curtas por estação,
montado pelo addon `ui/app/addons/tutorial.tsx` na camada de overlay
inferior-direita do shell (`AddonsLayer`).

## Persistência do "não mostrar de novo"

- **Chave**: `colar-de-sons:tutorial:dismissed:v1` em `localStorage`, valor `'true'`.
- **Escopo**: por navegador/perfil — o proxy de "por usuário" do MVP (a
  facilitadora usa o próprio dispositivo; não há id de usuário disponível na
  camada de UI até a autenticação real).
- **Versão na chave**: incrementar o sufixo `v1` reapresenta as dicas numa
  release futura sem migração.
- **Degradação**: acesso ao storage sempre em try/catch — se indisponível
  (ex.: Safari com todos os cookies bloqueados), o dismissal vale só pela
  sessão e as dicas voltam na próxima visita; o app nunca quebra.

## Dois níveis de dismiss

- Fechar (X, ESC ou clique fora) esconde enquanto a sessão estiver aberta:
  trocar de estação preserva a escolha (o addon fica montado), mas sair para o
  dashboard desmonta o popup e outra sessão volta a oferecer as dicas.
- "Não mostrar de novo" persiste (chave acima) e desliga o auto-abrir.
- O gatilho "?" (`Como funciona esta etapa`) permanece nos dois casos como
  rota de reencontro — dispensar nunca custa a informação.
