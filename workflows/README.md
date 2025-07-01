# Sistema de Workflows de Chatbot para Chatwoot

Este sistema permite criar fluxos de chatbot interativos com botões para WhatsApp, integrado ao Chatwoot.

## 🚀 Funcionalidades

- ✅ Fluxos de conversa com botões interativos
- ✅ Integração com WhatsApp Business API
- ✅ Aplicação automática de tags no Chatwoot
- ✅ Histórico de conversas
- ✅ Variáveis dinâmicas nas mensagens
- ✅ Webhooks para receber mensagens
- ✅ API REST para controle manual

## 📋 Pré-requisitos

1. **Chatwoot configurado** (já está funcionando)
2. **Conta WhatsApp Business API**
3. **Node.js 18+**
4. **Docker e Docker Compose** (opcional)

## 🔧 Configuração

### 1. Configurar Variáveis de Ambiente

Copie o arquivo `env.example` para `.env`:

```bash
cp env.example .env
```

Edite o arquivo `.env` com suas configurações:

```env
# Configurações do Chatwoot
CHATWOOT_BASE_URL=https://crm.inovaianalytics.com.br
CHATWOOT_API_TOKEN=seu_token_da_api_chatwoot

# Configurações do WhatsApp Business API
WHATSAPP_API_TOKEN=seu_token_whatsapp_business
WHATSAPP_PHONE_ID=seu_phone_number_id

# Configurações do servidor
PORT=3001
```

### 2. Obter Token da API do Chatwoot

1. Acesse seu Chatwoot: `https://crm.inovaianalytics.com.br`
2. Vá em **Configurações** > **Perfil**
3. Gere um novo token de API
4. Copie o token para a variável `CHATWOOT_API_TOKEN`

### 3. Configurar WhatsApp Business API

1. Acesse [Meta for Developers](https://developers.facebook.com/)
2. Crie um app e configure o WhatsApp Business API
3. Obtenha o token de acesso e Phone Number ID
4. Configure o webhook: `https://workflows.inovaianalytics.com.br/webhook/whatsapp`

## 🏃‍♂️ Execução

### Opção 1: Execução Local

```bash
# Instalar dependências
npm install

# Executar em desenvolvimento
npm run dev

# Executar em produção
npm start
```

### Opção 2: Execução com Docker

```bash
# Construir e executar
docker-compose -f docker-compose-workflows.yaml up -d

# Ver logs
docker-compose -f docker-compose-workflows.yaml logs -f chatbot-workflows
```

## 📱 Como Funciona

### 1. Fluxo de Conversa

O sistema funciona com blocos de conversa que podem ter:
- **Mensagem**: Texto enviado ao cliente
- **Botões**: Opções de resposta (máximo 3)
- **Próximo bloco**: Para onde ir após a resposta
- **Tags**: Tags aplicadas no Chatwoot

### 2. Exemplo de Fluxo

```javascript
'bloco_1': {
  message: 'Oi {{nome}}, aqui é o Rafa da Wizard BH Buritis! 🌟',
  buttons: [
    { text: 'Sim', next_block: 'bloco_2' },
    { text: 'Não', next_block: 'finalizar', tag: 'lead_frio' }
  ]
}
```

### 3. Variáveis Dinâmicas

Use `{{variavel}}` nas mensagens para inserir dados dinâmicos:
- `{{nome}}` - Nome do contato
- `{{empresa}}` - Nome da empresa
- `{{telefone}}` - Telefone do contato

## 🔌 APIs Disponíveis

### Iniciar Workflow Manualmente

```bash
POST /api/workflow/start
Content-Type: application/json

{
  "contactId": "123456789",
  "workflowName": "fluxo_comercial",
  "initialData": {
    "nome": "João Silva",
    "empresa": "Empresa XYZ"
  }
}
```

### Verificar Status da Conversa

```bash
GET /api/conversation/123456789
```

### Webhook do WhatsApp

```bash
POST /webhook/whatsapp
```

## 📊 Monitoramento

### Logs

Os logs são salvos em:
- **Local**: `./logs/`
- **Docker**: `docker-compose logs chatbot-workflows`

### Métricas

- Conversas ativas
- Taxa de conclusão
- Tempo médio de resposta
- Tags aplicadas

## 🛠️ Personalização

### Adicionar Novo Fluxo

1. Edite o arquivo `chatbot-workflow-system.js`
2. Adicione um novo fluxo na variável `workflows`
3. Defina os blocos e botões
4. Reinicie o serviço

### Exemplo de Novo Fluxo

```javascript
'fluxo_suporte': {
  name: 'Fluxo de Suporte',
  blocks: {
    'inicio': {
      message: 'Como posso te ajudar hoje?',
      buttons: [
        { text: 'Problema técnico', next_block: 'tecnico' },
        { text: 'Dúvida sobre produto', next_block: 'produto' }
      ]
    }
  }
}
```

## 🔒 Segurança

- Tokens de API armazenados em variáveis de ambiente
- Validação de webhooks do WhatsApp
- Rate limiting nas APIs
- Logs de auditoria

## 🚨 Troubleshooting

### Problemas Comuns

1. **Webhook não recebe mensagens**
   - Verifique se a URL está correta no Meta for Developers
   - Confirme se o servidor está acessível publicamente

2. **Botões não aparecem**
   - Verifique se o WhatsApp Business API está configurado
   - Confirme se o token está correto

3. **Tags não são aplicadas**
   - Verifique se o token do Chatwoot está correto
   - Confirme se o contato existe no Chatwoot

### Logs de Debug

Ative logs detalhados definindo:
```env
LOG_LEVEL=debug
```

## 📞 Suporte

Para suporte técnico:
- Email: suporte@inovaianalytics.com.br
- Documentação: [Link para docs]
- Issues: [Link para GitHub]

## 📄 Licença

MIT License - veja o arquivo LICENSE para detalhes. 