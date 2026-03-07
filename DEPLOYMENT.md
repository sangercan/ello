# ELLO - Desenvolvimento e Deployment

Guia completo para desenvolvimento e deployment da aplicação ELLO (Backend + Frontend Web).

## 📋 Arquitetura da Aplicação

```
┌─────────────────────┐
│   Frontend Web      │
│  (React + TypeScript)│
│  Port: 3000         │
└──────────┬──────────┘
           │ HTTP/WebSocket
           ▼
┌─────────────────────┐
│   FastAPI Backend   │
│   (Python)          │
│   Port: 8000        │
└──────────┬──────────┘
           │
     ┌─────┴────────────┐
     ▼                  ▼
  PostgreSQL          Redis
  Port: 5432          Port: 6379
```

## 🚀 Quick Start - Desenvolvimento Local

### Pré-requisitos
- Docker & Docker Compose
- Node.js 16+ (apenas para dev do frontend)
- Python 3.9+ (apenas para dev do backend isolado)

### 1. Clonar e Navegar

```bash
cd e:\ello
```

### 2. Iniciar Com Docker Compose

```bash
docker-compose up -d
```

Isso inicia:
- ✅ PostgreSQL (localhost:5432)
- ✅ Redis (localhost:6379)  
- ✅ Backend FastAPI (localhost:8000)
- ✅ Frontend Web (localhost:3000 - se configurado)

### 3. Verificar Status

```bash
# Backend health check
curl http://localhost:8000/health

# Swagger docs
open http://localhost:8000/docs
```

### 4. Desenvolvimento Frontend

```bash
cd ello-web

# Instalar dependências (primeira vez)
npm install

# Iniciar servidor com hot reload
npm run dev

# Abrir http://localhost:3000
```

### 5. Desenvolvimento Backend (Isolado)

```bash
cd ello-backend

# Criar venv
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate  # Windows

# Instalar dependências
pip install -r requirements.txt

# Rodar servidor
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 🔐 Configuração de Segurança

### Backend (.env necessário)

```bash
cd ello-backend
cp .env.example .env
```

Editar `ello-backend/.env`:
```ini
# OBRIGATORIO - Alterar antes de produção!
SECRET_KEY=seu-secret-aleatorio-super-seguro-aqui

DATABASE_URL=postgresql://ello:ello_password@localhost:5432/ello_db
REDIS_URL=redis://localhost:6379/0

# Produção
ENVIRONMENT=production
DEBUG=false

# CORS - Produção
ALLOWED_ORIGINS=https://ellosocial.com,https://ello.com,https://seu-dominio.com

# Email (opcional)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASSWORD=sua-app-password
```

### Frontend (.env.local)

```bash
cd ello-web
```

Criar `ello-web/.env.local`:
```
VITE_API_URL=http://localhost:8000
# Produção:
# VITE_API_URL=https://api.ellosocial.com
```

---

## 🏗️ Build para Produção

### 1. Frontend Build

```bash
cd ello-web

# Build otimizado
npm run build

# Output: ello-web/dist/

# Testar build localmente
npm run preview
```

### 2. Backend Build

O backend usa Docker:

```bash
cd ello-backend

# Build de imagem Docker
docker build -t ello-backend:latest .

# Run container
docker run -p 8000:8000 \
  -e SECRET_KEY="seu-secret" \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  ello-backend:latest
```

---

## 🐳 Docker Compose - Produção

### Arquivo: docker-compose.yml

Configurar variáveis de PRÉ-PRODUÇÃO:

```yaml
services:
  backend:
    environment:
      SECRET_KEY: "MUDE_ISSO_IMEDIATAMENTE!"
      ENVIRONMENT: "production"
      DEBUG: "false"
      ALLOWED_ORIGINS: "https://seu-dominio.com,https://api.seu-dominio.com"
      POSTGRES_PASSWORD: "senha-forte-aqui-64-chars"
      
  postgres:
    environment:
      POSTGRES_PASSWORD: "senha-forte-aqui-64-chars"
      POSTGRES_USER: "ello"
      POSTGRES_DB: "ello_db"
```

### Deploy em Produção

```bash
# 1. Atualizar variáveis de ambiente
vim docker-compose.yml  # ou editar com seu editor

# 2. Iniciar serviços
docker-compose -f docker-compose.yml up -d

# 3. Verificar logs
docker-compose logs -f backend

# 4. Backup automático do banco
docker exec ello-postgres pg_dump -U ello ello_db > backup-$(date +%Y%m%d).sql
```

---

## 📱 Endpoints Principais

### Autenticação
- **POST** `/auth/login` - Login (response: `access_token`)
- **POST** `/auth/register` - Registrar novo usuário
- **POST** `/auth/logout` - Logout (token no header)

### Usuários
- **GET** `/users/me` - Dados do usuário autenticado
- **PUT** `/users/me` - Atualizar perfil
- **GET** `/users/{id}` - Perfil de outro usuário
- **GET** `/users/{id}/followers` - Seguidores
- **GET** `/users/{id}/following` - Seguindo

### Moments
- **GET** `/moments` - Feed de moments (paginado)
- **POST** `/moments` - Criar novo moment
- **POST** `/moments/{id}/like` - Curtir
- **DELETE** `/moments/{id}/like` - Descurtir

### Vibes
- **GET** `/vibes` - Feed de vibes (paginado)
- **POST** `/vibes` - Criar novo vibe
- **POST** `/vibes/{id}/like` - Curtir
- **DELETE** `/vibes/{id}/like` - Descurtir

### Social
- **POST** `/social/{userId}/follow` - Seguir usuário
- **DELETE** `/social/{userId}/follow` - Deixar de seguir

### WebSocket
- **WS** `/ws/{user_id}` - Conexão em tempo real
  - Typing indicators
  - Message delivery
  - Call signaling
  - Location updates

### Health
- **GET** `/health` - Status da API

---

## 🧪 Testes

### Backend

```bash
cd ello-backend

# Instalar dependências de teste
pip install pytest pytest-asyncio httpx

# Rodar testes
pytest tests/ -v

# Com cobertura
pytest tests/ --cov=app --cov-report=html
```

### Frontend

```bash
cd ello-web

# Vitest (configurado no Vite)
npm run test

# Com Watch
npm run test:watch

# Coverage
npm run test:coverage
```

---

## 🔍 Logging e Debugging

### Backend Logs

```bash
# Ver logs do container
docker-compose logs -f backend

# Debug com variedade
LOG_LEVEL=DEBUG docker-compose up backend

# Em arquivo
docker-compose logs backend > logs/backend.log
```

### Frontend DevTools

```bash
# Abrir developer tools em localhost:3000
- F12 ou Ctrl+Shift+I
- React DevTools (extensão Chrome)
- Redux DevTools (Zustand compatible)
```

---

## ⚡ Performance

### Frontend Otimizações

- TypeScript strict mode ✅
- Tree-shaking com Vite ✅
- CSS purging com Tailwind ✅
- Code splitting automático ✅
- Image optimization (usar Next.js Image component se upgradar)

### Backend Otimizações

- Redis caching ✅
- Database connection pooling ✅
- Async/await para I/O ✅
- Request validation com Pydantic ✅

---

## 🚨 Troubleshooting

### Backend não conecta ao PostgreSQL

```bash
# Verificar serviço PostgreSQL
docker-compose ps postgres

# Reconectar
docker-compose restart postgres backend

# Recriar volumes
docker-compose down -v
docker-compose up -d
```

### Frontend 404 em /api

```
Certificar que:
1. Backend está rodando (localhost:8000)
2. Vite proxy está correto (vite.config.ts)
3. VITE_API_URL está correto em .env.local
```

### WebSocket connection refused

```bash
# Backend requer /ws route
# Frontend: useEffect(() => { websocket = new WebSocket(...) })

# Check:
curl http://localhost:8000/ws/1  # Deve dar erro HTTP 400 (normal, é WS)
```

---

## 📝 Checklist de Produção

- [ ] `SECRET_KEY` alterado (complexo, 32+ chars)
- [ ] `ALLOWED_ORIGINS` restrito a domínios reais
- [ ] `DEBUG=false` no backend
- [ ] HTTPS/TLS configurado no reverse proxy
- [ ] Backup automático do PostgreSQL configurado
- [ ] Monitoramento de logs ativo
- [ ] Rate limiting implementado (nginx/API)
- [ ] CORS headers corretos
- [ ] Autoscaling configurado (se cloud)
- [ ] CI/CD pipeline para deployments
- [ ] Testes coverage > 80%
- [ ] Documentação API atualizada (Swagger)

---

## 🔗 Links Úteis

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [React Docs](https://react.dev/)
- [Vite Guide](https://vitejs.dev/)
- [Docker Compose](https://docs.docker.com/compose/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Tailwind CSS](https://tailwindcss.com/)

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verificar logs: `docker-compose logs`
2. Consultar documentação de cada serviço
3. Reportar issues com contexto claro

---

**Última atualização**: 2024
**Versão**: 1.0.0
