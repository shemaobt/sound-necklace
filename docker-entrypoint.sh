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

# O nginx acrescenta a URI inteira ao proxy_pass, então uma barra final no segredo
# viraria `//api/...`. Tirar aqui é mais barato que confiar em quem edita o segredo.
BACKEND_URL="${BACKEND_URL%/}"

envsubst '$BACKEND_URL' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'
