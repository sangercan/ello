# 🚀 Ello Social - Aplicação Completa

> Plataforma social moderna com frontend React e backend FastAPI

## ✨ Status Atual

- ✅ **Frontend:** http://localhost:3000 (React + Vite + TypeScript)
- ✅ **Backend:** http://localhost:8000 (FastAPI + SQLAlchemy)
- ✅ **Database:** PostgreSQL 15 (localhost:5432)
- ✅ **Cache:** Redis 7 (localhost:6379)
- ✅ **Autenticação:** JWT implementada
- ✅ **Registro de Usuário:** Funcionando
- ✅ **Login:** Funcionando
- ✅ **Landing Page:** Modernizada com status do backend

## 🎯 Começando Rápido

### 1. Iniciar a Aplicação

```bash
docker compose up -d --build
```

### 2. Acessar a Aplicação

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

### 3. Registrar Novo Usuário

```
1. Acesse http://localhost:3000
2. Clique "Get Started"
3. Preencha o formulário
4. Clique "Cadastrar"
5. Será redirecionado para dashboard
```

### 4. Testar API

```bash
# Registrar
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "João Silva",
    "username": "joaosilva",
    "email": "joao@example.com",
    "password": "senha123"
  }'
```

## 📁 Estrutura de Pastas

```
ello/
├── ello-backend/          # FastAPI backend
│   ├── app/
│   │   ├── main.py       # Entry point
│   │   ├── models/       # SQLAlchemy models
│   │   ├── routes/       # API endpoints
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── dependencies.py
│   │   └── database.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env
│
├── ello-web/              # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   ├── services/      # API client
│   │   ├── store/         # Zustand stores
│   │   ├── types/         # TypeScript types
│   │   └── styles/        # Tailwind CSS
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── Dockerfile
│   ├── nginx.conf
│   └── .env
│
├── docker-compose.yml     # Orquestração
├── STATUS.md             # Status da aplicação
├── DEBUG_GUIDE.md        # Guia de debug
├── AUTH_GUIDE.md         # Guia de autenticação
└── README.md             # Este arquivo
```

## 🔐 Autenticação

### Como Funciona

```
1. Usuário se registra → POST /auth/register
2. Backend cria usuário e retorna JWT token
3. Frontend armazena token em localStorage
4. Token é enviado em todos os requests no header
5. Backend valida token e retorna dados do usuário
```

### Endpoints

| Método | Endpoint | Descrição | Autenticação |
|--------|----------|-----------|--------------|
| POST | `/auth/register` | Registrar novo usuário | ❌ Não |
| POST | `/auth/login` | Login | ❌ Não |
| POST | `/auth/dev-login` | Dev login (teste) | ❌ Não |
| GET | `/users/me` | Obter perfil do usuário | ✅ Sim |
| GET | `/users/{id}` | Obter perfil de outro usuário | ✅ Sim |

## 🧪 Testando

### Via Interface Web

1. Acesse http://localhost:3000
2. Veja o status do backend na landing page
3. Clique "Get Started" para registrar
4. Preencha os dados e envie

### Via API (cURL)

```bash
# Registrar
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Teste",
    "username": "testeuser",
    "email": "teste@example.com",
    "password": "senha123"
  }'
```

### Via Swagger UI

1. Acesse http://localhost:8000/docs
2. Procure pelo endpoint desejado
3. Clique "Try it out"
4. Preencha os dados
5. Clique "Execute"

## 🗄️ Banco de Dados

### Conectar ao PostgreSQL

```bash
docker exec -it ello_postgres psql -U ello -d ello_db
```

### Comandos Úteis

```sql
-- Listar tabelas
\dt

-- Listar usuários
SELECT id, username, email, full_name FROM users;

-- Ver estrutura da tabela
\d users

-- Deletar usuário
DELETE FROM users WHERE email = 'teste@example.com';

-- Sair
\q
```

## 🔄 Redis

### Conectar ao Redis

```bash
docker exec -it ello_redis redis-cli
```

### Comandos Úteis

```
PING                    # Verificar conexão
KEYS *                  # Listar todas as chaves
GET <key>              # Obter valor
DEL <key>              # Deletar chave
FLUSHDB                # Limpar banco
EXIT                   # Sair
```

## 📊 Arquitetura

```
┌──────────────────────────┐
│   Frontend (3000)        │
│  React + Vite + TW CSS   │
└────────────┬─────────────┘
             │ HTTP REST
┌────────────▼─────────────┐
│   Backend (8000)         │
│  FastAPI + SQLAlchemy    │
└────────┬─────────┬───────┘
         │         │
    ┌────▼──┐  ┌──▼───┐
    │ DB    │  │Cache │
    │ (5432)│  │(6379)│
    └───────┘  └──────┘
```

## 🐛 Troubleshooting

### Erro: "Not authenticated"

**Solução:**
1. Faça novo registro
2. Verifique localStorage: `JSON.parse(localStorage.getItem('auth-storage'))`
3. Verifique se token está sendo enviado nos requests

Veja `AUTH_GUIDE.md` para detalhes.

### Erro: "Connection refused"

**Solução:**
```bash
docker compose restart backend
```

### Erro: "Database connection failed"

**Solução:**
```bash
docker compose down -v
docker compose up -d
```

### Banco já tem usuário

**Solução:**
```sql
DELETE FROM users WHERE email = 'seu@email.com';
```

## 📚 Documentação

- [AUTH_GUIDE.md](./AUTH_GUIDE.md) - Guia completo de autenticação
- [DEBUG_GUIDE.md](./DEBUG_GUIDE.md) - Guia de debugging
- [STATUS.md](./STATUS.md) - Status da aplicação

## 🎨 Landing Page

A landing page foi modernizada com:

- ✨ Gradientes animados
- 🎯 CTA buttons dinâmicos
- 📊 Status do backend em tempo real
- 🎭 Seção de features
- 📈 Estatísticas
- 🔗 Footer com links sociais

## 🚀 Próximos Passos

### Curto Prazo
- [ ] Implementar dashboard
- [ ] Criar moments
- [ ] Sistema de likes/comentários
- [ ] Feed social

### Médio Prazo
- [ ] Chat em tempo real (WebSocket)
- [ ] Upload de imagens
- [ ] Notificações push
- [ ] Search de usuários

### Longo Prazo
- [ ] Vibes (conteúdo trending)
- [ ] Stories (24h ephemeral content)
- [ ] Calls (áudio/vídeo)
- [ ] Nearby (localização)
- [ ] Mobile app (React Native)

## 📝 Variáveis de Ambiente

### Backend (.env)

```
DATABASE_URL=postgresql://ello:ello123@db:5432/ello_db
REDIS_HOST=redis
REDIS_PORT=6379
SECRET_KEY=ello_super_secret_key_change_in_production_12345
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
ALLOWED_ORIGINS=*
DEBUG=true
```

### Frontend (.env)

```
VITE_API_URL=http://localhost:8000
```

## 💻 Comandos Úteis

```bash
# Iniciar
docker compose up -d --build

# Parar
docker compose down

# Ver logs
docker compose logs -f backend
docker compose logs -f frontend

# Reset completo
docker compose down -v
docker compose up -d --build

# Remover containers antigos
docker container prune -f

# Remover imagens
docker rmi ello-backend ello-frontend
```

## 🔑 Credenciais Padrão

| Serviço | Usuário | Senha |
|---------|---------|-------|
| PostgreSQL | ello | ello123 |
| Redis | - | - |
| Admin Backend | - | - |

## 🎯 Endpoints Principais

### Health Check
- `GET /health` - Status do servidor
- `GET /` - Info do servidor

### Autenticação
- `POST /auth/register` - Registrar novo usuário
- `POST /auth/login` - Login com credenciais
- `POST /auth/dev-login` - Dev login (teste)

### Usuários
- `GET /users/me` - Perfil do usuário logado
- `GET /users/{id}` - Perfil de outro usuário
- `PUT /users/me` - Atualizar perfil
- `GET /users/{id}/followers` - Listar followers
- `GET /users/{id}/following` - Listar seguindo

### Momentos
- `GET /moments` - Listar moments
- `POST /moments` - Criar moment
- `GET /moments/{id}` - Detalhes do moment
- `DELETE /moments/{id}` - Deletar moment
- `POST /moments/{id}/like` - Dar like
- `DELETE /moments/{id}/like` - Remover like

## 📞 Suporte

Para problemas:
1. Verifique `DEBUG_GUIDE.md`
2. Verifique `AUTH_GUIDE.md`
3. Abra issue no repositório
4. Verifique logs: `docker compose logs -f`

## 📄 Licença

MIT

## 👥 Autor

Desenvolvido com ❤️ para a comunidade Ello Social
