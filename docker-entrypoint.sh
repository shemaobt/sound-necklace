#!/bin/sh
set -e

# Docker Compose local monta os segredos aqui; no Cloud Run BACKEND_URL já chega
# como env var do serviço e este bloco não faz nada.
if [ -f /run/secrets/.env ]; then
  set -a
  . /run/secrets/.env
  set +a
fi

if [ -z "$BACKEND_URL" ]; then
  echo "BACKEND_URL não definida — o proxy de /api não teria destino." >&2
  exit 1
fi

envsubst '$BACKEND_URL' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'
