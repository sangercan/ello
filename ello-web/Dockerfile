# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_URL=/api
ARG VITE_WS_URL=
ARG VITE_STUN_URL=
ARG VITE_TURN_URL=
ARG VITE_TURN_USER=
ARG VITE_TURN_PASS=

ENV VITE_API_URL=$VITE_API_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_STUN_URL=$VITE_STUN_URL \
    VITE_TURN_URL=$VITE_TURN_URL \
    VITE_TURN_USER=$VITE_TURN_USER \
    VITE_TURN_PASS=$VITE_TURN_PASS

COPY ello-web/package*.json ./

RUN if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; else npm install --legacy-peer-deps; fi

COPY ello-web/ .

# Build: prefer the project `build` script (runs tsc + vite), fallback to npx
# Use npx fallback to avoid executing package bin files with missing exec bits.
RUN npm run build 2>/dev/null || npx vite build

# Stage 2: Runtime (Nginx to serve React app)
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

COPY ./ello-web/nginx.conf /etc/nginx/nginx.conf

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1

CMD ["nginx", "-g", "daemon off;"]
