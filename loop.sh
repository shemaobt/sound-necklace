#!/usr/bin/env bash
# Ralph Wiggum loop — outer body for the Nori "loop" skillset (see PROMPT.md).
#
# Pré-requisitos (uma vez):
#   nori-skillsets switch loop        # ativa o profile do loop (global!)
#   fnm use 22                        # Node >= 22.12
#   pnpm install && pnpm exec playwright install chromium
# Para voltar ao profile normal depois: nori-skillsets switch high-autonomy
#
# Uso: ./loop.sh [flags extras do claude, ex.: --dangerously-skip-permissions]
# Pare com Ctrl-C entre iterações. Cada iteração roda num worktree NOVO a partir
# de origin/main (o skillset exige começar fora de branch protegida) e o agente
# renomeia o branch para o nome sugerido pelo Linear.

set -euo pipefail
cd "$(dirname "$0")"

if [ "$(nori-skillsets current 2>/dev/null)" != "loop" ]; then
  echo "profile ativo não é 'loop' — rode: nori-skillsets switch loop" >&2
  exit 1
fi

while :; do
  git fetch origin main
  ts="$(date +%Y%m%d-%H%M%S)"
  wt=".worktrees/loop-$ts"
  git worktree add "$wt" -b "loop-bootstrap-$ts" origin/main
  (
    cd "$wt"
    cat PROMPT.md | claude "$@" || true
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
