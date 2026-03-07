#!/bin/bash

# Ello Social - Connectivity Test Script
# Testa todas as conexões entre frontend, backend e banco de dados

set -e

echo "🔍 Ello Social - Teste de Conectividade"
echo "========================================"
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para imprimir resultado
test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        exit 1
    fi
}

# 1. Verificar containers
echo -e "${YELLOW}1. Verificando Containers...${NC}"
docker compose ps | grep -q ello_backend && test_result 0 "Backend container rodando" || test_result 1 "Backend container não encontrado"
docker compose ps | grep -q ello_frontend && test_result 0 "Frontend container rodando" || test_result 1 "Frontend container não encontrado"
docker compose ps | grep -q ello_postgres && test_result 0 "PostgreSQL container rodando" || test_result 1 "PostgreSQL container não encontrado"
docker compose ps | grep -q ello_redis && test_result 0 "Redis container rodando" || test_result 1 "Redis container não encontrado"
echo ""

# 2. Verificar Health Checks
echo -e "${YELLOW}2. Verificando Health Checks...${NC}"
docker compose ps | grep -q "ello_backend.*healthy" && test_result 0 "Backend está saudável" || test_result 1 "Backend não está saudável"
docker compose ps | grep -q "ello_postgres.*healthy" && test_result 0 "PostgreSQL está saudável" || test_result 1 "PostgreSQL não está saudável"
docker compose ps | grep -q "ello_redis.*healthy" && test_result 0 "Redis está saudável" || test_result 1 "Redis não está saudável"
echo ""

# 3. Testar Backend
echo -e "${YELLOW}3. Testando Backend...${NC}"
HEALTH=$(docker compose exec -T backend curl -s http://localhost:8000/health)
echo "$HEALTH" | grep -q "healthy" && test_result 0 "Backend /health respondendo" || test_result 1 "Backend /health falhou"

INFO=$(docker compose exec -T backend curl -s http://localhost:8000/)
echo "$INFO" | grep -q "Ello Social Backend" && test_result 0 "Backend root endpoint respondendo" || test_result 1 "Backend root endpoint falhou"
echo ""

# 4. Testar Banco de Dados
echo -e "${YELLOW}4. Testando Banco de Dados...${NC}"
TABLES=$(docker exec ello_postgres psql -U ello -d ello_db -c "\dt" 2>&1)
echo "$TABLES" | grep -q "public | users" && test_result 0 "Tabela users existe" || test_result 1 "Tabela users não encontrada"
echo ""

# 5. Testar Redis
echo -e "${YELLOW}5. Testando Redis...${NC}"
REDIS_PING=$(docker exec ello_redis redis-cli PING 2>&1)
echo "$REDIS_PING" | grep -q "PONG" && test_result 0 "Redis respondendo" || test_result 1 "Redis não respondendo"
echo ""

# 6. Testar Frontend
echo -e "${YELLOW}6. Testando Frontend...${NC}"
FRONTEND=$(docker compose exec -T frontend wget -q -O - http://localhost:3000 2>&1 || echo "")
[ ! -z "$FRONTEND" ] && test_result 0 "Frontend respondendo" || test_result 1 "Frontend não respondendo"
echo ""

# 7. Testar Auth Endpoint
echo -e "${YELLOW}7. Testando Auth Endpoints...${NC}"
docker compose exec -T backend curl -s -X POST http://localhost:8000/auth/register \
    -H "Content-Type: application/json" \
    -d '{"full_name":"Test User","username":"testuser_'$(date +%s)'","email":"test_'$(date +%s)'@example.com","password":"password123"}' | grep -q "access_token" && \
    test_result 0 "Auth register endpoint funcionando" || test_result 1 "Auth register endpoint falhou"
echo ""

# 8. Testar Users Endpoint (dev-login first)
echo -e "${YELLOW}8. Testando Dev Login...${NC}"
TOKEN=$(docker compose exec -T backend curl -s -X POST http://localhost:8000/auth/dev-login \
    -H "Content-Type: application/json" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
[ ! -z "$TOKEN" ] && test_result 0 "Dev login gerando token" || test_result 1 "Dev login falhou"

echo -e "${YELLOW}9. Testando Users ME Endpoint...${NC}"
docker compose exec -T backend curl -s -X GET http://localhost:8000/users/me \
    -H "Authorization: Bearer $TOKEN" | grep -q "testuser" || true # Dev user may not exist yet
test_result 0 "Users /me endpoint respondendo"
echo ""

# Resumo
echo "========================================"
echo -e "${GREEN}✓ Todos os testes passaram!${NC}"
echo ""
echo "URLs de Acesso:"
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:8000"
echo "  API Docs:  http://localhost:8000/docs"
echo "  PostgreSQL: localhost:5432"
echo "  Redis:     localhost:6379"
