# Imagem de produção do SPA: build estático com pnpm, servido por nginx na 8080.
# Espelha tripod-console/meaning-map-ui — mesma organização, mesmo Cloud Run.
#
# A ÚNICA variável de build é VITE_API_MODE=real. VITE_API_BASE_URL fica de fora
# de propósito: sem ela, ui/app/api-config.ts cai no default `/api`, que o nginx
# faz proxy para o backend resolvido em RUNTIME. Assim a mesma imagem serve
# qualquer ambiente e trocar o backend não exige rebuild.

FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable

# .npmrc junto: é ele que carrega engine-strict, o piso de Node >= 22.12. Sem ele
# uma imagem base que caísse abaixo do piso quebraria adiante, não no install.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
ENV VITE_API_MODE=real
RUN pnpm build

FROM nginx:stable-alpine AS runtime

# nginx.conf é TEMPLATE: ${BACKEND_URL} só é substituído no entrypoint. O
# security-headers.conf NÃO é template — vai direto, e o nginx.conf o inclui por
# location (o envsubst reescreveria os $ da CSP se passasse por ele).
COPY nginx.conf /etc/nginx/nginx.conf.template
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

RUN mkdir -p /var/cache/nginx /var/run /var/log/nginx && \
  chown -R nginx:nginx /var/cache/nginx /var/run /var/log/nginx /usr/share/nginx/html && \
  touch /var/run/nginx.pid && \
  chown nginx:nginx /var/run/nginx.pid

EXPOSE 8080

CMD ["/docker-entrypoint.sh"]
