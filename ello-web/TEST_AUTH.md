# 🧪 Guia de Teste - Autenticação Ello Social

## ⚡ Teste Rápido (Recomendado)

### Opção 1: Usar Endpoint de Teste (SEM REGISTRAR)

1. **Abra o console do navegador** (F12 → Console)

2. **Execute este comando para gerar um usuário de teste:**
```javascript
const response = await fetch('http://localhost:8000/auth/test-register', {
  method: 'POST'
});
const data = await response.json();
console.log('Token:', data.access_token);
localStorage.setItem('auth-storage', JSON.stringify({ state: { token: data.access_token } }));
console.log('✅ Usuário de teste criado e logado!');
// Agora recarregue a página
```

3. **Recarregue a página** (F5) e você estará automaticamente logado no `/dashboard`

---

## 📝 Teste Completo (REGISTRO + LOGIN)

### Opção 2: Registrar um Novo Usuário

1. Acesse: **http://localhost:3000/register**

2. Preencha o formulário:
   - **Nome:** João Silva
   - **Usuário:** joaosilva
   - **Email:** joao@example.com (use um email bem formatado)
   - **Senha:** senha123
   - **Confirmar Senha:** senha123

3. Clique em "Cadastrar"

4. **Verifique o Console (F12) para ver os logs:**
   ```
   📝 Iniciando registro com: joao@example.com
   ✅ Resposta do registro: {...}
   💾 Salvando token...
   👤 Buscando dados do usuário...
   ✅ Dados do usuário: {...}
   ```

5. Se bem-sucedido, será redirecionado para `/dashboard`

---

### Opção 3: Fazer Login com Usuário Existente

1. Acesse: **http://localhost:3000/login**

2. Preencha:
   - **Email/Usuário:** joao@example.com (ou joaosilva)
   - **Senha:** senha123

3. Clique em "Entrar"

4. **Verifique o Console (F12):**
   ```
   🔐 Iniciando login com: joao@example.com
   ✅ Resposta do login: {...}
   💾 Salvando token...
   👤 Buscando dados do usuário...
   ✅ Dados do usuário: {...}
   ```

---

## 🔍 Debugar Problemas

### Erro 422 - Unprocessable Entity
**Causa:** Email inválido ou não seguindo o formato esperado

**Solução:**
- Use um email com formato válido: `usuario@example.com`
- Não use espaços no email
- Não use caracteres especiais

### Erro 401 - Invalid credentials
**Causa:** Usuário não existe ou senha incorreta

**Solução:**
- Verifique se registrou o usuário corretamente
- Confirme a senha digitada
- Pode usar a Opção 1 para testar rapidamente

### Token não salvando
**Solução:**
```javascript
// Abra o Console (F12) e execute:
JSON.parse(localStorage.getItem('auth-storage'))
// Deve mostrar o token salvo
```

### Verificar Dados do Usuário
```javascript
// No Console:
const auth = JSON.parse(localStorage.getItem('auth-storage'));
console.log('Token:', auth.state.token);
console.log('User:', auth.state.user);
```

---

## 📊 Fluxo Esperado

```
[REGISTRO/LOGIN] → [POST /auth/register ou /auth/login] 
    ↓
[BACKEND] → Retorna access_token
    ↓
[FRONTEND] → Salva token em localStorage
    ↓
[FRONTEND] → GET /users/me com token
    ↓
[BACKEND] → Retorna dados do usuário
    ↓
[FRONTEND] → Navega para /dashboard
    ↓
[DASHBOARD] → Mostra "Bem-vindo, {nome}!"
```

---

## ✅ Checklist de Sucesso

- [ ] Endpoint `/auth/test-register` retorna token (sem erros)
- [ ] Token salvo em localStorage
- [ ] Navegador redireciona para `/dashboard`
- [ ] Dashboard mostra o nome do usuário
- [ ] Console mostra todos os 4 logs: 📝 → ✅ → 💾 → 👤 → ✅
- [ ] F5 (recarregar) mantém autenticado
- [ ] /logout limpa token e volta para /login

---

## 🚀 Próximos Passos

Se tudo funcionar:
1. ✅ Delete o arquivo `TEST_AUTH.md`
2. ✅ Teste a criação de moments
3. ✅ Teste o vibes feed
4. ✅ Teste a seguir usuários

Se algo não funcionar:
1. ⚠️ Abra F12 (Console)
2. ⚠️ Procure por logs com 🔐 📝 👤 ✅ ❌
3. ⚠️ Procure por mensagens de erro vermelhas
4. ⚠️ Verifique Network tab para requisições HTTP

