# ???? Guia de Autentica????o - Ello Social

## ??? Problemas Resolvidos

### Erro: "Not authenticated"

**Causa:** O token JWT n??o estava sendo enviado corretamente na requisi????o `/users/me`

**Solu????o Implementada:**
1. ??? authStore agora gerencia tokens centralizadamente
2. ??? Token ?? armazenado em localStorage ap??s registro/login
3. ??? Token ?? enviado em todos os requests no header `Authorization: Bearer <token>`
4. ??? Token ?? restaurado automaticamente ao recarregar a p??gina

## ???? Fluxo de Autentica????o

```
1. REGISTRO (POST /auth/register)
   ?????? Envia: { full_name, username, email, password }
   ?????? Backend: Cria usu??rio, gera JWT
   ?????? Retorna: { access_token, token_type }

2. ARMAZENAR TOKEN
   ?????? Frontend: Salva token em localStorage (via Zustand persist)
   ?????? Define header: Authorization: Bearer <token>
   ?????? Estado: { token, user, isAuthenticated: true }

3. OBTER DADOS DO USU??RIO (GET /users/me)
   ?????? Envia: Header { Authorization: Bearer <token> }
   ?????? Backend: Valida token, busca usu??rio
   ?????? Retorna: { id, username, email, full_name, ... }

4. REDIRECIONAR PARA DASHBOARD
   ?????? Se isAuthenticated === true ??? vai para /dashboard
```

## ???? Testando Autentica????o

### 1. Registrar Novo Usu??rio

**Via Interface Web:**
```
1. Acesse http://localhost:3000
2. Clique "Get Started"
3. Preencha:
   - Nome: Jo??o Silva
   - Usu??rio: joaosilva
   - Email: joao@example.com
   - Senha: senha123
4. Clique "Cadastrar"
```

**Resultado esperado:**
- ??? Usu??rio criado no PostgreSQL
- ??? JWT token retornado
- ??? Token armazenado em localStorage
- ??? Redireciona automaticamente para /dashboard

### 2. Verificar Token em localStorage

**No navegador (DevTools):**
```javascript
// Abra o console (F12)
JSON.parse(localStorage.getItem('auth-storage'))

// Sa??da esperada:
{
  "state": {
    "token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
  },
  "version": 0
}
```

### 3. Testar Endpoint Protegido

**Via cURL:**
```bash
# 1. Registrar
TOKEN=$(curl -s -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Test",
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }' | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# 2. Usar token para acessar /users/me
curl -X GET http://localhost:8000/users/me \
  -H "Authorization: Bearer $TOKEN"

# Sa??da esperada:
# {
#   "id": 1,
#   "username": "testuser",
#   "email": "test@example.com",
#   "full_name": "Test",
#   ...
# }
```

## ???? Token Refresh

Quando o token expira (padr??o: 1440 minutos = 24 horas):

```javascript
// Logout autom??tico e pedido para re-autenticar
const useAuthStore = create(...)

// Catch 401 responses
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      useAuthStore.setState({ isAuthenticated: false, token: null })
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

## ??????? Seguran??a

### Token JWT

**Estrutura:**
```
Header.Payload.Signature
```

**Payload cont??m:**
```json
{
  "user_id": 1,
  "exp": 1709580000,
  "iat": 1709493600
}
```

**Verifica????o:**
- ??? Assinado com `SECRET_KEY`
- ??? Validado em cada requisi????o
- ??? Expira ap??s tempo configurado
- ??? ??nico por usu??rio

### Hashing de Senha

**Algoritmo:** SHA256 + BCrypt

```python
# Backend - criar hash
password = "senha123"
password_hash = hash_password(password)  # SHA256 + BCrypt
# Armazenado no banco

# Backend - verificar
verify_password("senha123", password_hash)  # True/False
```

## ???? Checklist de Autentica????o

- [x] Endpoint POST /auth/register funcionando
- [x] Endpoint POST /auth/login funcionando
- [x] JWT token sendo gerado
- [x] Token armazenado em localStorage
- [x] Token enviado em requisi????es posteriores
- [x] Endpoint GET /users/me protegido
- [x] Token validado no backend
- [x] Usu??rio obtido do banco e retornado
- [x] Logout remove token
- [x] Page refresh restaura autentica????o

## ???? Troubleshooting

### Erro: "Invalid authentication credentials"

**Causa:** Token inv??lido ou expirado

**Solu????o:**
```javascript
// Fazer novo login
const { register } = useAuthStore()
await register({
  full_name: "Nome",
  username: "usuario",
  email: "email@example.com",
  password: "senha123"
})
```

### Erro: "User not found"

**Causa:** Usu??rio foi deletado mas token ainda est?? no localStorage

**Solu????o:**
```javascript
// Limpar localStorage
localStorage.removeItem('auth-storage')
// E fazer novo registro
```

### Token n??o sendo enviado

**Causa:** Header Authorization n??o est?? sendo adicionado

**Verifica????o:**
```javascript
// Abra DevTools ??? Network
// Verifique se requests t??m header:
// Authorization: Bearer eyJ0eXAi...
```

## ???? Configura????o

### Backend (.env)

```
SECRET_KEY=ello_super_secret_key_change_in_production_12345
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

### Frontend (vite.config.ts)

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    },
  },
},
```

## ???? Exemplo de Fluxo Completo

```typescript
// 1. Usu??rio preenche form e clica "Cadastrar"
const handleRegister = async (formData) => {
  const { register } = useAuthStore()
  await register({
    full_name: formData.name,
    username: formData.username,
    email: formData.email,
    password: formData.password,
  })
  // authStore autom??ticamente:
  // - POST /auth/register
  // - Armazena token
  // - GET /users/me com token
  // - Seta user, isAuthenticated=true
  // - Redireciona para /dashboard
}

// 2. Dashboard acessa dados do usu??rio
function Dashboard() {
  const { user, isAuthenticated } = useAuthStore()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }
  
  return <h1>Bem-vindo, {user?.full_name}!</h1>
}

// 3. Fazer requisi????o protegida
async function fetchMoments() {
  // Token ?? automaticamente adicionado ao header
  const response = await api.get('/moments')
  return response.data
}
```

## ???? Logs para Debug

### Backend

```bash
docker compose logs backend -f | grep -E "auth|login|register|user"
```

### Frontend (Console)

```javascript
// Adicione logs ao authStore
console.log('Register:', response.data)
console.log('Token:', state.token)
console.log('User:', sta