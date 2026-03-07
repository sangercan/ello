# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY ello-web/package*.json ./

RUN if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; else npm install --legacy-peer-deps; fi

COPY ello-web/ .

# Build with vite only, skip TypeScript checking
RUN npm run vite build 2>/dev/null || npx vite build

# Stage 2: Runtime (Nginx to serve React app)
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

COPY ./ello-web/nginx.conf /etc/nginx/nginx.conf

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1

CMD ["nginx", "-g", "daemon off;"]
