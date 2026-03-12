# Deploy Producao (ellosocial.com)

Guia de deploy seguro para `129.121.36.183` sem sobrescrever dados existentes.

## 1. Preparar servidor

```bash
ssh root@129.121.36.183
mkdir -p /opt/ello
cd /opt/ello
```

Copie o projeto para `/opt/ello` (git clone ou rsync/scp).

## 2. Configurar ambiente de producao

```bash
cd /opt/ello
cp .env.prod.example .env.prod
nano .env.prod
```

Valores obrigatorios:
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `SECRET_KEY`
- `ALLOWED_ORIGINS=https://ellosocial.com,https://www.ellosocial.com`

Opcional (recomendado para chamadas de voz/vídeo):
- `VITE_API_URL=/api` (default já aplicado)
- `VITE_WS_URL` (somente se precisar forçar outra origem de WS)
- `VITE_STUN_URL=stun:stun.l.google.com:19302,stun:global.stun.twilio.com:3478`
- `VITE_TURN_URL=turns:turn.example.com:5349` (URL(s) separadas por vírgula)
- `VITE_TURN_USER=usuario`
- `VITE_TURN_PASS=senha`

## 3. Primeira subida (sem apagar dados)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## 4. Atualizacao de versao (recomendado)

Use o script seguro:

```bash
chmod +x deploy/update-prod.sh
PROJECT_DIR=/opt/ello COMPOSE_FILE=docker-compose.prod.yml ENV_FILE=.env.prod ./deploy/update-prod.sh
```

Esse fluxo:
- gera backup SQL antes da atualizacao,
- faz `git pull --rebase`,
- rebuilda backend/frontend,
- sobe com `up -d` sem remover volumes,
- preserva banco e uploads.

## 5. Garantia de nao sobrescrever tabelas

Na API atual:
- `Base.metadata.create_all(bind=engine)` cria apenas tabelas faltantes,
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` adiciona colunas faltantes,
- nao existe comando de drop automatico de tabela.

Mesmo assim, sempre manter backup antes de atualizar.

## 6. Nginx reverso (host)

Use `deploy/nginx/ellosocial.com.conf` no host e recarregue nginx:

```bash
nginx -t && systemctl reload nginx
```

## 7. Auto start dos servicos no boot (systemd)

Para garantir que backend/frontend/db/redis subam automaticamente com o sistema:

```bash
cp /opt/ello/deploy/ello-compose.service /etc/systemd/system/ello-compose.service
systemctl daemon-reload
systemctl enable ello-compose.service
systemctl start ello-compose.service
systemctl status ello-compose.service
```

Isso executa `docker compose ... up -d` no boot, e com `restart: unless-stopped` os containers voltam automaticamente.

## 8. Comandos proibidos em producao

Nao rode estes comandos em producao se quiser preservar dados:

```bash
docker compose down -v
```

O `-v` apaga volumes (banco e uploads).
