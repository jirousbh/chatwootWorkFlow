# Configurações para Resolver Problemas de Notificações no Chatwoot

## 1. Problemas Identificados

### 1.1 Configuração do Nginx
- ❌ Falta configuração específica para ActionCable (`/cable`)
- ❌ Timeouts inadequados para WebSockets
- ❌ Falta configuração para webhooks do Chatwoot

### 1.2 Configurações de Ambiente
- ❌ VAPID keys não configuradas para notificações push
- ❌ `ENABLE_PUSH_RELAY_SERVER=true` mas sem chaves VAPID
- ❌ Possível problema com configurações de WebSocket

## 2. Soluções

### 2.1 Configuração do Nginx (Arquivo: nginx-chatwoot.conf)

Use o arquivo `nginx-chatwoot.conf` criado que inclui:

```nginx
# Configuração para ActionCable (WebSockets do Chatwoot)
location /cable {
    proxy_pass http://localhost:4500;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    
    # Timeouts para WebSockets
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
    proxy_connect_timeout 86400;
}
```

### 2.2 Configurações de Ambiente (.envinovai)

Adicione/modifique estas configurações no arquivo `.envinovai`:

```bash
# Push Notifications - Gerar chaves em: https://d3v.one/vapid-key-generator/
VAPID_PUBLIC_KEY=sua_chave_publica_aqui
VAPID_PRIVATE_KEY=sua_chave_privada_aqui

# Configurações de WebSocket
FORCE_SSL=false
FRONTEND_URL=https://crm.inovaianalytics.com.br

# Configurações de notificação
ENABLE_PUSH_RELAY_SERVER=true

# Configurações de ActionCable
ACTION_CABLE_ALLOWED_REQUEST_ORIGINS=https://crm.inovaianalytics.com.br
```

### 2.3 Comandos para Aplicar as Mudanças

```bash
# 1. Gerar chaves VAPID
# Acesse: https://d3v.one/vapid-key-generator/
# Copie as chaves geradas

# 2. Atualizar arquivo .envinovai
nano .envinovai
# Adicione as chaves VAPID

# 3. Aplicar nova configuração do nginx
sudo cp nginx-chatwoot.conf /etc/nginx/sites-available/crm.inovaianalytics.com.br
sudo ln -sf /etc/nginx/sites-available/crm.inovaianalytics.com.br /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 4. Reiniciar containers do Chatwoot
docker-compose down
docker-compose up -d

# 5. Verificar logs
docker-compose logs -f rails
docker-compose logs -f sidekiq
```

## 3. Verificações

### 3.1 Testar WebSockets
```bash
# Verificar se ActionCable está funcionando
curl -I https://crm.inovaianalytics.com.br/cable
```

### 3.2 Verificar Logs
```bash
# Logs do Rails
docker-compose logs rails | grep -i "actioncable\|websocket\|notification"

# Logs do Sidekiq
docker-compose logs sidekiq | grep -i "notification\|push"
```

### 3.3 Testar Notificações
1. Abra o Chatwoot em dois navegadores diferentes
2. Faça login com usuários diferentes
3. Envie uma mensagem de um usuário para outro
4. Verifique se as notificações aparecem em tempo real

## 4. Configurações Adicionais

### 4.1 Configurações de Redis
Verifique se o Redis está configurado corretamente:
```bash
# Testar conexão com Redis
docker-compose exec redis redis-cli -a invoAI@76825 ping
```

### 4.2 Configurações de Sidekiq
Verifique se o Sidekiq está processando jobs:
```bash
# Verificar status do Sidekiq
docker-compose exec rails bundle exec rails console
# No console: Sidekiq::Stats.new.processed
```

## 5. Troubleshooting

### 5.1 Se as notificações ainda não funcionarem:
1. Verifique se o navegador suporta WebSockets
2. Verifique se não há bloqueios de firewall
3. Verifique se o SSL está configurado corretamente
4. Verifique os logs do navegador (F12) para erros de WebSocket

### 5.2 Logs importantes para verificar:
- `ActionCableBroadcastJob` nos logs do Sidekiq
- Conexões WebSocket nos logs do Rails
- Erros de VAPID nos logs do Rails 