# 🔍 Guia de Debug - Ello Social

## Verificação de Conectividade

### 1. Verificar Status dos Containers

```bash
docker compose ps
```

**Status esperado:**
- ✅ ello_backend: healthy
- ✅ ello_frontend: healthy
- ✅ ello_postgres: healthy
- ✅ ello_redis: healthy

### 2. Testar Endpoints do Backend

```bash
# Health Check
curl http://localhost:8000/health

# Root Info
curl http://localhost:8000/

# API Docs
curl http://localhost:8000/docs
```

### 3. Verificar Banco de Dados

```bash
# Conectar ao PostgreSQL
docker exec -it ello_postgres psql -U ello -d ello_db

# Listar tabelas
\dt

# Verificar usuários
SELECT * FROM users;

# Sair
\q
```

### 4. Verificar Redis

```bash
# Conectar ao Redis
docker exec -it ello_redis redis-cli

# Verificar conexão
PING

# Sair
EXIT
```

### 5. Verificar Frontend

```bash
# Logs do frontend
docker compose logs frontend -f

# Verificar se está rodando
curl http://localhost:3000
```

## Testando Cadastro de Usuário

### Via API (cURL)

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Teste Usuário",
    "username": "testeuser",
    "email": "teste@example.com",
    "password": "senha123"
  }'
```

**Resposta esperada:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

### Via UI

1. Acesse http://localhost:3000
2. Clique em "Get Started"
3. Preencha o formulário de registro
4. Clique em "Cadastrar"

## Possíveis Erros e Soluções

### ❌ Erro: "User already exists"

**Causa:** Email ou usuário já registrado no banco de dados

**Solução:**
```sql
-- Deletar usuário de teste
DELETE FROM users WHERE email = 'teste@example.com';
```

### ❌ Erro: "Invalid credentials"

**Causa:** Senha incorreta ou usuário não encontrado

**Solução:**
- Verificar se o usuário foi criado: `SELECT * FROM users WHERE email='...';`
- Verificar se a senha foi armazenada com hash

### ❌ Erro: "Connection refused"

**Causa:** Backend não está rodando ou não acessível

**Solução:**
```bash
# Reiniciar backend
docker compose restart backend

# Verificar logs
docker compose logs backend
```

### ❌ Erro: CORS

**Causa:** Frontend não consegue conectar ao backend

**Solução:**
1. Verificar `ALLOWED_ORIGINS` no backend (deve incluir `*` ou `http://localhost:3000`)
2. Verificar `VITE_API_URL` no frontend (deve apontar para `http://localhost:8000`)
3. Reiniciar containers

```bash
docker compose down
docker compose up -d
```

### ❌ Erro: "Banco de dados não encontrado"

**Causa:** Banco não foi inicializado

**Solução:**
```bash
# Deletar volumes e recriar
docker compose down -v
docker compose up -d

# Aguardar containers iniciarem
sleep 10

# Verificar se tabelas foram criadas
docker exec -it ello_postgres psql -U ello -d ello_db -c "\dt"
```

## Verificação de Logs

### Backend

```bash
# Logs em tempo real
docker compose logs backend -f

# Últimas 50 linhas
docker compose logs backend --tail 50
```

### Frontend

```bash
# Logs em tempo real
docker compose logs frontend -f

# Últimas 50 linhas
docker compose logs frontend --tail 50
```

### PostgreSQL

```bash
# Logs em tempo real
docker compose logs db -f
```

## Checklist de Debug

- [ ] Todos os containers estão rodando (`docker compose ps`)
- [ ] Backend responde a `/health` (`curl http://localhost:8000/health`)
- [ ] PostgreSQL está acessível (`docker exec ello_postgres psql ...`)
- [ ] Redis está acessível (`docker exec ello_redis redis-cli ping`)
- [ ] Frontend consegue carregar (`curl http://localhost:3000`)
- [ ] CORS está configurado corretamente no backend
- [ ] `VITE_API_URL` está correto no frontend
- [ ] Banco de dados tem as tabelas criadas (`\dt` no psql)
- [ ] Token JWT está sendo retornado no registro
- [ ] Token está sendo armazenado no localStorage

## Reset Completo

Se nada funcionar, faça um reset completo:

```bash
# Parar e remover tudo
docker compose down -v

# Remover imagens
docker rmi ello-backend ello-frontend

# Reconstruir e iniciar
docker compose up -d --build

# Aguardar inicialização
sleep 15

# Verificar status
docker compose ps
```

## URLs Importantes

| Serviço | URL | Credenciais |
|---------|-----|------------|
| Frontend | http://localhost:3000 | - |
| Backend API | http://localhost:8000 | - |
| API Docs | http://localhost:8000/docs | - |
| PostgreSQL | localhost:5432 | ello / ello123 |
| Redis | localhost:6379 | - |

## Contato para Suporte

Se encontrar erros que não estão listados aqui:

1. Coletar logs: `docker compose logs > logs.txt`
2. Reproduzir o erro
3. Compartilhar logs e passos para reproduzir
