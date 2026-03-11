# ELLO Web Frontend

Uma aplicação web moderna construída com React 18, TypeScript e Vite.

## 🚀 Tecnologias

- **React 18.2.0** - UI Framework
- **TypeScript 5.3.3** - Type Safety
- **Vite 5.0.8** - Build tool & Dev server
- **Tailwind CSS 3.4.0** - Styling
- **React Router v6** - Navigation
- **Zustand 4.4.0** - State Management
- **Axios 1.6.0** - HTTP Client
- **React Hot Toast 2.4.1** - Notifications
- **Lucide React 0.307.0** - Icons

## 📁 Estrutura do Projeto

```
ello-web/
├── src/
│   ├── components/          # Componentes reutilizáveis
│   │   ├── Navbar.tsx
│   │   └── ProtectedRoute.tsx
│   ├── pages/              # Páginas/Views
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── MomentsPage.tsx
│   │   ├── VibesPage.tsx
│   │   ├── ProfilePage.tsx
│   │   └── SettingsPage.tsx
│   ├── services/           # API Client
│   │   └── api.ts
│   ├── store/              # State Management (Zustand)
│   │   └── authStore.ts
│   ├── types/              # TypeScript Types
│   │   └── index.ts
│   ├── styles/             # Global Styles
│   │   └── globals.css
│   ├── App.tsx             # Root Component com Routing
│   └── main.tsx            # Entry Point
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

## 🔧 Instalação

### Pré-requisitos
- Node.js 16+
- npm ou yarn

### Passos

```bash
# Instalar dependências
npm install

# Copiar arquivo de ambiente
cp .env.example .env.local

# Iniciar servidor de desenvolvimento
npm run dev

# Build para produção
npm run build

# Preview build local
npm run preview

# Lint com TypeScript
npm run lint
```

## 🌐 Acesso

Após `npm run dev`:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000 (proxy para `/api`)

## 🔐 Autenticação

O sistema utiliza JWT tokens armazenados em localStorage via Zustand.

### Fluxo de Login
1. Usuário entra credenciais em `/login`
2. API retorna `access_token`
3. Token armazenado em `authStore`
4. Redirecionado para `/dashboard`
5. Todas as requisições incluem header `Authorization: Bearer {token}`

### Rotas Protegidas

Rotas como `/dashboard`, `/moments`, `/vibes`, `/profile`, `/settings` requerem autenticação. Usuários não autenticados são redirecionados para `/login`.

## 📝 Endpoints da API

A aplicação faz requisições para estes endpoints do backend:

### Auth
- `POST /auth/login` - Login
- `POST /auth/register` - Registrar

### Users
- `GET /users/me` - Usuário atual
- `GET /users/{id}` - Perfil do usuário
- `PUT /users/me` - Atualizar perfil
- `GET /users/{id}/followers` - Seguidores
- `GET /users/{id}/following` - Seguindo

### Moments
- `GET /moments` - Lista de moments
- `POST /moments` - Criar moment
- `POST /moments/{id}/like` - Curtir moment
- `DELETE /moments/{id}/like` - Descurtir

### Vibes
- `GET /vibes` - Lista de vibes
- `POST /vibes/like` - Curtir vibe
- `DELETE /vibes/{id}/like` - Descurtir

### Social
- `POST /social/{userId}/follow` - Seguir usuário
- `DELETE /social/{userId}/follow` - Deixar de seguir

## 🎨 Tema

O projeto usa tema escuro (dark theme) com Tailwind CSS:

- **Cor Primária**: `#a855f7` (purple-500)
- **Background**: `#0f172a` (slate-950)
- **Cards**: `#1e293b` (slate-800)

## 🔌 Variáveis de Ambiente

Crie `.env.local` ou use variáveis de build no Docker.

Exemplo mínimo para desenvolvimento (Vite já faz proxy de `/api` e `/ws` para `localhost:8000`):

```
# Base da API (em dev, usar "/api" mantém o proxy do Vite)
VITE_API_URL=/api

# Opcional: URL explícita de WebSocket (se precisar sobrescrever)
# VITE_WS_URL=https://ellosocial.com/api

# STUN/TURN (recomendado em produção para maior taxa de conexão P2P)
# Múltiplos valores separados por vírgula
# Ex.: VITE_STUN_URL=stun:stun.l.google.com:19302,stun:global.stun.twilio.com:3478
VITE_STUN_URL=stun:stun.l.google.com:19302,stun:global.stun.twilio.com:3478

# TURN (obrigatório para NATs restritivas)
# VITE_TURN_URL=turns:turn.example.com:5349
# VITE_TURN_USER=seu_usuario
# VITE_TURN_PASS=sua_senha
```

No Dockerfile de produção, estes `ARG/ENV` já estão suportados: `VITE_API_URL`, `VITE_WS_URL`, `VITE_STUN_URL`, `VITE_TURN_URL`, `VITE_TURN_USER`, `VITE_TURN_PASS`.

## 📦 Scripts Disponíveis

```bash
npm run dev       # Iniciar servidor de desenvolvimento
npm run build     # Build para produção
npm run preview   # Preview do build
npm run lint      # Verificar linting
```

## 🐛 Debug

O projeto suporta debugging com React DevTools e TypeScript IntelliSense no VS Code.

## 📄 Licença

Propriedade da aplicação ELLO.
