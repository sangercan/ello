#!/bin/bash

# Ello Social - Quick Start Script
# Inicializa e testa a aplicação completa

set -e

echo "🚀 Ello Social - Quick Start"
echo "============================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Verificar Docker
echo -e "${BLUE}1. Verificando Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo "❌ Docker não encontrado. Por favor instale Docker."
    exit 1
fi
echo -e "${GREEN}✓ Docker encontrado${NC}"
echo ""

# 2. Iniciar containers
echo -e "${BLUE}2. Iniciando containers...${NC}"
docker compose down 2>/dev/null || true
docker compose up -d --build
echo -e "${GREEN}✓ Containers iniciados${NC}"
echo ""

# 3. Aguardar inicialização
echo -e "${BLUE}3. Aguardando serviços iniciarem...${NC}"
sleep 15
echo -e "${GREEN}✓ Serviços prontos${NC}"
echo ""

# 4. Verificar status
echo -e "${BLUE}4. Verificando status dos containers...${NC}"
docker compose ps
echo ""

# 5. Testar conectividade
echo -e "${BLUE}5. Testando endpoints...${NC}"

# Health check
if docker compose exec -T backend curl -s http://localhost:8000/health | grep -q "healthy"; then
    echo -e "${GREEN}✓ Backend respondendo${NC}"
else
    echo -e "${YELLOW}⚠ Backend ainda inicializando${NC}"
fi

# Info
if docker compose exec -T backend curl -s http://localhost:8000/ | grep -q "Ello Social"; then
    echo -e "${GREEN}✓ API respondendo${NC}"
fi

# Database
if docker exec ello_postgres psql -U ello -d ello_db -c "SELECT 1;" 2>/dev/null; then
    echo -e "${GREEN}✓ PostgreSQL respondendo${NC}"
fi

# Redis
if docker exec ello_redis redis-cli PING 2>/dev/null | grep -q "PONG"; then
    echo -e "${GREEN}✓ Redis respondendo${NC}"
fi

echo ""

# 6. Exibir informações
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✨ Ello Social está pronto!${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}URLs de Acesso:${NC}"
echo "  🌐 Frontend:     http://localhost:3000"
echo "  🔧 Backend API:  http://localhost:8000"
echo "  📚 API Docs:     http://localhost:8000/docs"
echo "  💾 PostgreSQL:   localhost:5432"
echo "  ⚡ Redis:        localhost:6379"
echo ""
echo -e "${BLUE}Credenciais:${NC}"
echo "  PostgreSQL User:  ello"
echo "  PostgreSQL Pass:  ello123"
echo ""
echo -e "${BLUE}Próximos Passos:${NC}"
echo "  1. Acesse http://localhost:3000"
echo "  2. Clique em 'Get Started'"
echo "  3. Registre um novo usuário"
echo "  4. Explore a aplicação"
echo ""
echo -e "${BLUE}Comandos Úteis:${NC}"
echo "  Logs do Backend:   docker compose logs -f backend"
echo "  Logs do Frontend:  docker compose logs -f frontend"
echo "  Parar:            docker compose down"
echo "  Reset:            docker compose down -v && docker compose up -d --build"
echo "  DB Query:         docker exec -it ello_postgres psql -U ello -d ello_db"
echo ""
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo ""
echo "Documentação disponível em:"
echo "  - README.md       (Guia principal)"
echo "  - AUTH_GUIDE.md   (Autenticação)"
echo "  - DEBUG_GUIDE.md  (Troubleshooting)"
echo "  - STATUS.md       (Status da app)"
echo ""
