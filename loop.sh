#!/usr/bin/env bash
# Ralph Wiggum loop — outer body for the Nori "loop" skillset (see PROMPT.md).
#
# Pré-requisitos (uma vez):
#   nori-skillsets switch loop        # ativa o profile do loop (global!)
#   fnm use 22                        # Node >= 22.12
#   pnpm install && pnpm exec playwright install chromium
# Para voltar ao profile normal depois: nori-skillsets switch high-autonomy
#
# Uso: ./loop.sh [flags extras do claude]
#   - Roda em modo HEADLESS (claude -p): cada iteração termina sozinha ao fim
#     do turno — sem Ctrl-C.
#   - Permissões: --dangerously-skip-permissions é o DEFAULT (é um loop
#     autônomo; os guardrails reais são a branch protection + required checks
#     + a regra contract-critical-não-mergeia). Para rodar COM prompts de
#     autorização (primeira rodada supervisionada): LOOP_SAFE=1 ./loop.sh
# Pare com Ctrl-C entre iterações. Cada iteração roda num worktree NOVO a
# partir de origin/main (o skillset exige começar fora de branch protegida) e
# o agente renomeia o branch para o nome sugerido pelo Linear.

set -euo pipefail
cd "$(dirname "$0")"

if [ "$(nori-skillsets current 2>/dev/null)" != "loop" ]; then
  echo "profile ativo não é 'loop' — rode: nori-skillsets switch loop" >&2
  exit 1
fi

perm_flags=(--dangerously-skip-permissions)
if [ "${LOOP_SAFE:-0}" = "1" ]; then
  perm_flags=()
  echo "--- LOOP_SAFE=1: rodando COM prompts de permissão ---"
fi

while :; do
  git fetch origin main
  ts="$(date +%Y%m%d-%H%M%S)"
  wt=".worktrees/loop-$ts"
  git worktree add "$wt" -b "loop-bootstrap-$ts" origin/main
  (
    cd "$wt"
    # -p (headless): o processo ENCERRA ao fim do turno. Em modo texto o -p é
    # MUDO até o final; por isso emitimos stream-json e filtramos para linhas
    # legíveis (💬 texto do agente, 🔧 ferramenta, ✅ resultado) em tempo real.
    claude -p --verbose --output-format stream-json "${perm_flags[@]}" "$@" <PROMPT.md \
      | python3 -u loop-progress-filter.py || true
  )
  # Remove o worktree APENAS se não houver commits não enviados nem sujeira —
  # nunca perder trabalho de uma iteração interrompida antes do push.
  unpushed="$(git -C "$wt" log --branches --not --remotes --oneline 2>/dev/null | wc -l | tr -d ' ')"
  dirty="$(git -C "$wt" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$unpushed" = "0" ] && [ "$dirty" = "0" ]; then
    git worktree remove "$wt" --force 2>/dev/null || true
  else
    echo "--- worktree $wt preservado ($unpushed commits não enviados, $dirty arquivos sujos) ---"
  fi
  echo "--- iteração $ts encerrada; próxima em 10s (Ctrl-C para parar) ---"
  sleep 10
done
