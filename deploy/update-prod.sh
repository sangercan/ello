#!/usr/bin/env bash
set -euo pipefail

# Safe production update for ELLO
# - Keeps existing DB data (no volume removal)
# - Rebuilds with latest code
# - Creates timestamped DB backup before update

PROJECT_DIR="${PROJECT_DIR:-/opt/ello}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
TS="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"

cd "$PROJECT_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "[ERRO] Arquivo $ENV_FILE nao encontrado em $PROJECT_DIR"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Load environment vars for backup command
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "[1/5] Backup do banco (sem parar producao)..."
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps db >/dev/null 2>&1; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
    pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_DIR/ello_db_$TS.sql"
  echo "Backup salvo em $BACKUP_DIR/ello_db_$TS.sql"
else
  echo "[AVISO] Servico db nao encontrado no compose. Pulando backup automatico."
fi

echo "[2/5] Atualizando codigo..."
if [ -d .git ]; then
  git fetch --all --prune
  git pull --rebase
else
  echo "[AVISO] Diretorio nao e um repositorio git. Seguindo com codigo atual em disco."
fi

echo "[3/5] Build das imagens de producao..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build backend frontend

echo "[4/5] Subindo atualizacao sem destruir volumes..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans

echo "[5/5] Validando servicos..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo "Atualizacao concluida com seguranca."
echo "IMPORTANTE: nao use 'docker compose down -v' em producao para nao apagar dados."
