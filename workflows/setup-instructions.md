# Instruções de Configuração - Sistema de Workflows Chatwoot

## 📋 Checklist de Configuração

### ✅ 1. Preparação do Ambiente

- [ ] Node.js 18+ instalado
- [ ] Docker e Docker Compose (opcional)
- [ ] Acesso ao Chatwoot funcionando
- [ ] Conta WhatsApp Business API

### ✅ 2. Configuração do Chatwoot

#### 2.1 Obter Token da API

1. Acesse: `https://crm.inovaianalytics.com.br`
2. Faça login com sua conta
3. Vá em **Configurações** (ícone de engrenagem) > **Perfil**
4. Role até a seção **API Access Tokens**
5. Clique em **Generate New Token**
6. Dê um nome como "Workflow System"
7. Copie o token gerado

#### 2.2 Verificar Configurações

1. Vá em **Configurações** > **Inboxes**
2. Verifique se o WhatsApp está configurado
3. Anote o ID da inbox do WhatsApp

### ✅ 3. Configuração WhatsApp Business API

#### 3.1 Criar App no Meta for Developers

1. Acesse: https://developers.facebook.com/
2. Clique em **Create App**
3. Selecione **Business** como tipo
4. Preencha as informações básicas
5. Adicione o produto **WhatsApp**

#### 3.2 Configurar WhatsApp Business

1. No painel do app, vá em **WhatsApp** > **Getting Started**
2. Anote o **Phone Number ID**
3. Clique em **Generate Token** para obter o **Access Token**
4. Configure o webhook:
   - URL: `https://workflows.inovaianalytics.com.br/webhook/whatsapp`
   - Verify Token: `chatwoot_workflows_2024`

#### 3.3 Configurar Webhook

1. No painel do WhatsApp, vá em **Configuration**
2. Em **Webhook**, clique em **Edit**
3. Configure:
   - **Callback URL**: `https://workflows.inovaianalytics.com.br/webhook/whatsapp`
   - **Verify Token**: `chatwoot_workflows_2024`
4. Selecione os campos:
   - `messages`
   - `message_deliveries`
   - `message_reads`

### ✅ 4. Configuração do Sistema de Workflows

#### 4.1 Instalar Dependências

```bash
# Navegar para o diretório do projeto
cd /caminho/para/chatwoot-workflows

# Instalar dependências
npm install
```

#### 4.2 Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp env.example .env

# Editar arquivo .env
nano .env
```

Conteúdo do arquivo `.env`:

```env
# Configurações do Chatwoot
CHATWOOT_BASE_URL=https://crm.inovaianalytics.com.br
CHATWOOT_API_TOKEN=seu_token_aqui
CHATWOOT_ACCOUNT_ID=id_da_sua_conta

# Configurações do WhatsApp Business API
WHATSAPP_API_TOKEN=seu_token_whatsapp_aqui
WHATSAPP_PHONE_ID=seu_phone_number_id_aqui

# Configurações do servidor
PORT=3001
```

#### 4.3 Testar Configuração

```bash
# Executar em modo desenvolvimento
npm run dev

# Verificar se não há erros
# O servidor deve iniciar na porta 3001
```

### ✅ 5. Configuração do Nginx (Opcional)

#### 5.1 Configurar Domínio

1. Configure o DNS para apontar `workflows.inovaianalytics.com.br` para seu servidor
2. Certifique-se de que a porta 80 está liberada

#### 5.2 Instalar Certificado SSL

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx

# Obter certificado
sudo certbot --nginx -d workflows.inovaianalytics.com.br
```

### ✅ 6. Execução com Docker

#### 6.1 Construir e Executar

```bash
# Construir imagem
docker-compose -f docker-compose-workflows.yaml build

# Executar serviços
docker-compose -f docker-compose-workflows.yaml up -d

# Verificar status
docker-compose -f docker-compose-workflows.yaml ps
```

#### 6.2 Verificar Logs

```bash
# Ver logs do chatbot
docker-compose -f docker-compose-workflows.yaml logs -f chatbot-workflows

# Ver logs do nginx
docker-compose -f docker-compose-workflows.yaml logs -f nginx-workflows
```

### ✅ 7. Testes de Funcionamento

#### 7.1 Testar API

```bash
# Testar se o servidor está rodando (ajustado para novo endpoint)
curl http://localhost:3001/apiworkflow/conversation/test

# Testar webhook (deve retornar 200 OK)
curl -X POST http://localhost:3001/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

#### 7.2 Testar WhatsApp

1. Envie uma mensagem "oi" para o número do WhatsApp Business
2. Verifique se o bot responde com os botões
3. Teste clicar nos botões
4. Verifique se as tags são aplicadas no Chatwoot

### ✅ 8. Monitoramento

#### 8.1 Logs do Sistema

```bash
# Ver logs em tempo real
tail -f logs/chatbot.log

# Ver logs do Docker
docker-compose -f docker-compose-workflows.yaml logs -f
```

#### 8.2 Métricas

- Acesse: `https://workflows.inovaianalytics.com.br/status`
- Verifique conversas ativas
- Monitore taxa de sucesso

### ✅ 9. Personalização

#### 9.1 Adicionar Novo Fluxo

1. Edite o arquivo `chatbot-workflow-system.js`
2. Adicione um novo fluxo na variável `workflows`
3. Defina os blocos e botões
4. Reinicie o serviço

#### 9.2 Exemplo de Fluxo Personalizado

```javascript
'meu_fluxo': {
  name: 'Meu Fluxo Personalizado',
  blocks: {
    'inicio': {
      message: 'Olá! Como posso te ajudar?',
      buttons: [
        { text: 'Opção 1', next_block: 'bloco_1' },
        { text: 'Opção 2', next_block: 'bloco_2' }
      ]
    }
  }
}
```

### ✅ 10. Troubleshooting

#### 10.1 Problemas Comuns

**Erro: "Cannot connect to Chatwoot API"**
- Verifique se o token da API está correto
- Confirme se o Chatwoot está acessível

**Erro: "WhatsApp API error"**
- Verifique se o token do WhatsApp está correto
- Confirme se o Phone Number ID está correto

**Webhook não recebe mensagens**
- Verifique se a URL está correta no Meta for Developers
- Confirme se o servidor está acessível publicamente

#### 10.2 Logs de Debug

Ative logs detalhados:

```env
LOG_LEVEL=debug
```

#### 10.3 Reiniciar Serviços

```bash
# Reiniciar apenas o chatbot
docker-compose -f docker-compose-workflows.yaml restart chatbot-workflows

# Reiniciar todos os serviços
docker-compose -f docker-compose-workflows.yaml restart
```

## 🎯 Próximos Passos

1. **Testar fluxos básicos**
2. **Personalizar mensagens**
3. **Configurar tags automáticas**
4. **Implementar integrações adicionais**
5. **Monitorar performance**

## 📞 Suporte

Para suporte técnico:
- Email: suporte@inovaianalytics.com.br
- Documentação: [Link para docs]
- Issues: [Link para GitHub] 