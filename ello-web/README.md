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

Crie `.env.local`:

```
VITE_API_URL=http://localhost:8000
VITE_MOBILE_API_URL=https://ellosocial.com/api
```

`VITE_MOBILE_API_URL` e obrigatoria para builds nativos (Android/iOS), pois no app mobile nao existe proxy `/api`.

## 📦 Scripts Disponíveis

```bash
npm run dev       # Iniciar servidor de desenvolvimento
npm run build     # Build para produção
npm run preview   # Preview do build
npm run lint      # Verificar linting
npm run mobile:build  # Build + sync para Android/iOS (Capacitor)
npm run mobile:sync   # Re-sincronizar projetos nativos
npm run android:open  # Abrir projeto Android no Android Studio
npm run ios:open      # Abrir projeto iOS no Xcode (macOS)
```

## 📱 Publicação Mobile (Play Store / App Store)

### Setup inicial

```bash
npm install
npm run mobile:build
```

### Android (Windows/macOS/Linux)

1. Instale Android Studio + SDK + JDK 17.
2. Execute `npm run android:open`.
3. No Android Studio, gere `Build > Generate Signed Bundle / APK`.
4. Publique o `.aab` no Google Play Console.

### iOS (apenas macOS)

1. Em um Mac com Xcode, execute `npm run ios:open`.
2. Configure Signing & Capabilities (Team/Bundle ID).
3. Gere archive via `Product > Archive`.
4. Envie para App Store Connect com o Organizer.

## ☁️ Ionic Appflow

Com sua conta Appflow ja criada, use este fluxo para CI/CD mobile:

1. Conecte o repositorio no Appflow (GitHub/GitLab/Bitbucket).
2. Defina variaveis de ambiente no Appflow:
	- `VITE_MOBILE_API_URL=https://ellosocial.com/api`
	- `VITE_API_URL=https://ellosocial.com/api` (opcional)
3. Configure o comando de build web no Appflow:
	- `npm ci && npm run mobile:build`
4. Crie um build Android (AAB) no Appflow e publique no Play Console.
5. Para iOS, rode build no Appflow com certificado/provisioning e publique no App Store Connect.

Observacoes:
- O projeto usa Capacitor (`android/` e `ios/` no repositorio).
- Nao usar `VITE_API_URL=/api` para build mobile em nuvem; apps nativos precisam URL absoluta.

## 🐛 Debug

O projeto suporta debugging com React DevTools e TypeScript IntelliSense no VS Code.

## 📄 Licença

Propriedade da aplicação ELLO.
