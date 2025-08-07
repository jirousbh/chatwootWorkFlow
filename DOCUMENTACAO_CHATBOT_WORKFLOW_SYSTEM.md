# 📚 DOCUMENTAÇÃO COMPLETA - SISTEMA DE FLUXO DE CHATBOT

## 📋 ÍNDICE

1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Configurações e Variáveis de Ambiente](#configurações-e-variáveis-de-ambiente)
4. [Estrutura do Banco de Dados](#estrutura-do-banco-de-dados)
5. [Funcionalidades Principais](#funcionalidades-principais)
6. [Classes e Módulos](#classes-e-módulos)
7. [APIs e Endpoints](#apis-e-endpoints)
8. [Sistema de Logs](#sistema-de-logs)
9. [Controle de Status do Bot](#controle-de-status-do-bot)
10. [Sistema de Campanhas](#sistema-de-campanhas)
11. [Gerenciamento de Mídia](#gerenciamento-de-mídia)
12. [Comandos Especiais](#comandos-especiais)
13. [Webhooks e Integrações](#webhooks-e-integrações)
14. [Monitoramento e Health Checks](#monitoramento-e-health-checks)
15. [Troubleshooting](#troubleshooting)
16. [Exemplos de Uso](#exemplos-de-uso)

---

## 🎯 VISÃO GERAL

O **Sistema de Fluxo de Chatbot** é uma solução completa para automação de atendimento via WhatsApp integrada ao Chatwoot. O sistema permite criar workflows conversacionais complexos, gerenciar campanhas de marketing, controlar o status do bot e integrar com múltiplas contas do Chatwoot.

### 🚀 Principais Características

- **Workflows Conversacionais**: Criação de fluxos de conversa com blocos, botões e lógica condicional
- **Multi-Conta**: Suporte a múltiplas contas do Chatwoot
- **Atribuição Inteligente**: Sistema de atribuição automática de conversas para agentes e times
- **Campanhas de Marketing**: Envio de mensagens em massa via API oficial do WhatsApp
- **Controle de Status**: Pausa/reativação automática do bot baseada em atividade humana
- **Sistema de Logs**: Logs duplos (console + arquivo) com limpeza automática
- **Gerenciamento de Mídia**: Upload e envio de arquivos, imagens e vídeos
- **Webhooks**: Integração com webhooks do WhatsApp Business API
- **Interface Web**: Dashboard para gerenciamento de workflows e campanhas

---

## 🏗️ ARQUITETURA DO SISTEMA

### Componentes Principais

```
┌─────────────────────────────────────────────────────────────┐
│                    SISTEMA DE WORKFLOWS                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Frontend  │  │   API REST  │  │   Database  │         │
│  │   (React)   │◄─┤   (Express) │◄─┤ (PostgreSQL)│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Chatwoot  │  │   WhatsApp  │  │   Polling   │         │
│  │     API     │  │     API     │  │   System    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

1. **Entrada**: Mensagem recebida via webhook ou polling do Chatwoot
2. **Processamento**: Sistema identifica o workflow e processa a resposta
3. **Ação**: Envia resposta, atribui conversa, aplica labels, etc.
4. **Persistência**: Salva interação no banco de dados
5. **Saída**: Resposta enviada via API do Chatwoot

---

## ⚙️ CONFIGURAÇÕES E VARIÁVEIS DE AMBIENTE

### Variáveis Obrigatórias

```bash
# Chatwoot Configuration
CHATWOOT_BASE_URL=https://crm.inovaianalytics.com.br
CHATWOOT_API_TOKEN=seu_token_aqui
CHATWOOT_ACCOUNT_ID=1

# Database Configuration
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=chatwoot_workflows
POSTGRES_USER=postgres
POSTGRES_PASSWORD=invoAI@76825

# WhatsApp Business API (opcional)
WHATSAPP_API_TOKEN=seu_token_whatsapp
WHATSAPP_PHONE_ID=seu_phone_id
WHATSAPP_BUSINESS_ACCOUNT_ID=seu_business_account_id

# Server Configuration
PORT=3001
BASE_URL=https://workflows.inovaianalytics.com.br
```

### Variáveis Opcionais

```bash
# Logging
LOG_LEVEL=info
LOG_DIR=./logs

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Polling Configuration
POLLING_INTERVAL=5000
```

---

## 🗄️ ESTRUTURA DO BANCO DE DADOS

### Tabelas Principais

#### 1. `system_users`
Gerenciamento de usuários do sistema
```sql
CREATE TABLE system_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  assigned_accounts JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2. `workflow_configs`
Configurações de workflows
```sql
CREATE TABLE workflow_configs (
  id SERIAL PRIMARY KEY,
  workflow_name VARCHAR(255) UNIQUE NOT NULL,
  config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3. `workflow_conversations`
Conversas ativas dos workflows
```sql
CREATE TABLE workflow_conversations (
  id SERIAL PRIMARY KEY,
  contact_id VARCHAR(255) NOT NULL,
  conversation_id INTEGER,
  workflow_name VARCHAR(255) NOT NULL,
  current_block VARCHAR(255) NOT NULL,
  data JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'active',
  start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 4. `inbox_workflows`
Workflows específicos por caixa de entrada
```sql
CREATE TABLE inbox_workflows (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL,
  inbox_id INTEGER NOT NULL,
  workflow_name VARCHAR(255) NOT NULL,
  workflow_config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, inbox_id)
);
```

#### 5. `bot_conversation_status`
Controle de status do bot por conversa
```sql
CREATE TABLE bot_conversation_status (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER UNIQUE NOT NULL,
  contact_id VARCHAR(255) NOT NULL,
  bot_active BOOLEAN DEFAULT true,
  paused_reason VARCHAR(255),
  paused_by VARCHAR(255),
  paused_at TIMESTAMP,
  reactivated_at TIMESTAMP,
  last_agent_check TIMESTAMP,
  has_human_agent BOOLEAN DEFAULT false,
  agent_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 6. `campaigns`
Campanhas de marketing
```sql
CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  workflow_name VARCHAR(255) NOT NULL,
  target_contacts JSONB,
  schedule_type VARCHAR(50) DEFAULT 'immediate',
  scheduled_time TIMESTAMP,
  status VARCHAR(50) DEFAULT 'draft',
  created_by INTEGER REFERENCES system_users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 7. `media_files`
Arquivos de mídia
```sql
CREATE TABLE media_files (
  id VARCHAR(255) PRIMARY KEY,
  original_name VARCHAR(500) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  mimetype VARCHAR(100) NOT NULL,
  size BIGINT NOT NULL,
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  description TEXT,
  is_active BOOLEAN DEFAULT true
);
```

---

## 🔧 FUNCIONALIDADES PRINCIPAIS

### 1. Sistema de Workflows

#### Estrutura de um Workflow
```json
{
  "name": "Workflow de Vendas",
  "description": "Fluxo completo de vendas",
  "blocks": {
    "bloco_1": {
      "id": "welcome",
      "name": "Boas-vindas",
      "message": "Olá {{nome}}! Bem-vindo à nossa empresa.",
      "buttons": [
        {
          "text": "Quero comprar",
          "next_block": "produtos",
          "assign_team": 1,
          "assign_team_member": true,
          "assignment_strategy": "round_robin"
        },
        {
          "text": "Suporte",
          "next_block": "suporte",
          "assign_team": 2
        }
      ]
    },
    "produtos": {
      "id": "produtos",
      "name": "Catálogo de Produtos",
      "message": "Aqui estão nossos produtos:",
      "buttons": [
        {
          "text": "Produto A",
          "next_block": "finalizar",
          "tag": "interesse_produto_a"
        }
      ]
    }
  }
}
```

#### Funcionalidades dos Blocos
- **Mensagens**: Texto com suporte a variáveis `{{nome}}`
- **Botões**: Navegação entre blocos
- **Atribuições**: Automática para agentes/times
- **Labels**: Aplicação automática de etiquetas
- **Mídia**: Envio de imagens, vídeos e documentos

### 2. Sistema de Atribuição Inteligente

#### Estratégias de Atribuição
- **Round Robin**: Rotação entre agentes
- **Least Busy**: Agente com menos conversas ativas
- **Random**: Seleção aleatória

#### Exemplo de Configuração
```json
{
  "assign_team": 1,
  "assign_team_member": true,
  "assignment_strategy": "round_robin"
}
```

### 3. Sistema de Campanhas

#### Tipos de Campanha
- **Por Tag**: Envio para contatos com determinada etiqueta
- **Por CSV**: Upload de lista de contatos
- **Agendada**: Envio em horário específico

#### Processo de Envio
1. Validação de contatos
2. Verificação de template WhatsApp
3. Envio via API oficial
4. Controle de status e retry

---

## 🏛️ CLASSES E MÓDULOS

### 1. ConversationManager

Classe principal para gerenciamento de conversas

#### Métodos Principais
```javascript
class ConversationManager {
  // Carregar workflows do banco
  async loadWorkflowsFromDatabase()
  
  // Iniciar nova conversa
  async startConversation(contactId, workflowName, initialData)
  
  // Processar resposta do usuário
  async processResponse(contactId, userResponse)
  
  // Aplicar tag ao contato
  async applyTag(contactId, tag)
  
  // Processar ações de botões
  async processButtonActions(button, conversationId, contactId)
  
  // Finalizar conversa
  async finalizeConversation(contactId)
}
```

### 2. InboxWorkflowManager

Gerenciamento de workflows por caixa de entrada

#### Métodos Principais
```javascript
class InboxWorkflowManager {
  // Salvar workflow para caixa específica
  async saveInboxWorkflow(accountId, inboxId, workflowName, workflowConfig)
  
  // Obter workflow de caixa específica
  async getInboxWorkflow(accountId, inboxId)
  
  // Listar todos os workflows
  async getAllInboxWorkflows()
  
  // Desativar workflow
  async deactivateInboxWorkflow(accountId, inboxId)
}
```

---

## 🌐 APIS E ENDPOINTS

### Autenticação

#### POST `/api/auth/login`
Login de usuário
```json
{
  "username": "admin",
  "password": "admin123"
}
```

#### POST `/api/auth/change-password`
Alterar senha
```json
{
  "currentPassword": "senha_atual",
  "newPassword": "nova_senha"
}
```

### Gerenciamento de Contas

#### GET `/api/accounts`
Listar contas disponíveis

#### GET `/api/accounts/:accountId/inboxes`
Listar caixas de entrada de uma conta

### Workflows

#### GET `/api/inbox-workflows/:accountId/:inboxId`
Obter workflow de uma caixa de entrada

#### POST `/api/inbox-workflows`
Salvar workflow para caixa de entrada
```json
{
  "accountId": 1,
  "inboxId": 2,
  "workflowName": "Atendimento Padrão",
  "workflowConfig": { /* configuração do workflow */ }
}
```

#### GET `/api/workflow-templates`
Listar templates de workflows disponíveis

### Controle do Bot

#### GET `/api/bot-status/:conversationId`
Obter status do bot para uma conversa

#### POST `/api/bot-control/:conversationId/pause`
Pausar bot para uma conversa

#### POST `/api/bot-control/:conversationId/activate`
Reativar bot para uma conversa

#### GET `/api/bot-conversations`
Listar conversas com status do bot

### Campanhas

#### POST `/api/campaigns`
Criar nova campanha
```json
{
  "name": "Campanha de Marketing",
  "type": "tag",
  "tag_name": "clientes_ativos",
  "template_name": "marketing_template",
  "scheduled_at": "2024-01-15T10:00:00-03:00",
  "chatwoot_account_id": 1,
  "chatwoot_inbox_id": 2
}
```

#### GET `/api/campaigns`
Listar campanhas com estatísticas

#### POST `/api/campaigns/:id/start`
Iniciar campanha manualmente

#### POST `/api/campaigns/:id/retry`
Reenviar campanhas com erro

#### GET `/api/campaigns/:id/status`
Listar status de envio por campanha

### Gerenciamento de Usuários (Admin)

#### GET `/api/users`
Listar usuários

#### POST `/api/users`
Criar usuário
```json
{
  "username": "novo_usuario",
  "password": "senha123",
  "role": "user",
  "assigned_accounts": [1, 2]
}
```

#### PUT `/api/users/:id`
Atualizar usuário

#### DELETE `/api/users/:id`
Excluir usuário

### Mídia

#### POST `/api/upload-media`
Upload de arquivo de mídia

#### GET `/api/media-files`
Listar arquivos de mídia

#### DELETE `/api/media-files/:id`
Deletar arquivo de mídia

#### GET `/public-preview/:id`
Preview público de arquivo

### Integração Chatwoot

#### GET `/api/chatwoot/tags`
Listar tags do Chatwoot

#### GET `/api/chatwoot/agents`
Listar agentes do Chatwoot

#### GET `/api/chatwoot/teams`
Listar times do Chatwoot

#### POST `/api/chatwoot/labels`
Criar nova tag

### Integração WhatsApp

#### GET `/api/whatsapp/templates`
Listar templates da API oficial do WhatsApp

### Health Checks

#### GET `/health`
Status do sistema

---

## 📝 SISTEMA DE LOGS

### Características
- **Logs Duplos**: Console + arquivo
- **Timezone Brasil**: Horário local do Brasil
- **Limpeza Automática**: Logs antigos (>30 dias) são removidos
- **Níveis**: info, warn, error, debug

### Estrutura dos Logs
```
[2024-01-15 10:30:45] [INFO] Sistema de logs duplo inicializado
[2024-01-15 10:30:45] [INFO] Logs salvos em: /app/logs
[2024-01-15 10:30:45] [INFO] Logs visíveis via: docker logs chatwoot-chatbot-workflows-1
```

### Funções de Log
```javascript
// Logs específicos
log.info('Mensagem informativa');
log.warn('Aviso importante');
log.error('Erro crítico');
log.debug('Informação de debug');

// Logs automáticos
console.log('Log automático para info');
console.warn('Log automático para warn');
console.error('Log automático para error');
```

---

## 🤖 CONTROLE DE STATUS DO BOT

### Estados do Bot
- **Ativo**: Bot responde normalmente
- **Pausado**: Bot não responde (atendimento humano)

### Motivos de Pausa
- `human_handoff`: Transferência para atendimento humano
- `sector_transfer`: Transferência de setor
- `human_agent_active`: Agente humano ativo
- `manual_pause`: Pausa manual
- `button_action`: Ação de botão
- `system`: Pausa automática do sistema

### Reativação Automática
- **24h**: Bot reativado automaticamente após 24h de inatividade
- **Verificação**: A cada 30 minutos
- **Condições**: Sem atividade de agente humano

### Comandos de Controle
```javascript
// Pausar bot
await pauseBotForConversation(conversationId, contactId, 'manual_pause', 'admin');

// Reativar bot
await reactivateBotForConversation(conversationId, contactId, 'user_request');

// Verificar status
const status = await getBotConversationStatus(conversationId, contactId);
```

---

## 📢 SISTEMA DE CAMPANHAS

### Tipos de Campanha

#### 1. Campanha por Tag
```javascript
{
  "name": "Campanha Tag Clientes",
  "type": "tag",
  "tag_name": "clientes_ativos",
  "template_name": "marketing_template",
  "chatwoot_account_id": 1,
  "chatwoot_inbox_id": 2
}
```

#### 2. Campanha por CSV
```javascript
{
  "name": "Campanha CSV",
  "type": "csv",
  "template_name": "welcome_template",
  "chatwoot_account_id": 1,
  "chatwoot_inbox_id": 2
}
```

### Status de Campanha
- `draft`: Rascunho
- `pending`: Aguardando execução
- `running`: Em execução
- `completed`: Concluída
- `failed`: Falha
- `cancelled`: Cancelada

### Status de Envio
- `pending`: Aguardando envio
- `sent`: Enviado
- `delivered`: Entregue
- `failed`: Falha
- `cancelled`: Cancelado

### Processo de Envio
1. **Validação**: Verificar contatos e template
2. **Preparação**: Normalizar telefones e preparar payload
3. **Envio**: Via API oficial do WhatsApp
4. **Controle**: Atualizar status e tratar erros
5. **Retry**: Reenviar falhas automaticamente

### Templates WhatsApp
```javascript
// Buscar templates disponíveis
const templates = await axios.get(
  `https://graph.facebook.com/v23.0/${businessAccountId}/message_templates`,
  {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    params: { fields: 'name,status,category,language,components' }
  }
);

// Enviar template
const payload = {
  messaging_product: 'whatsapp',
  to: normalizedPhone,
  type: 'template',
  template: {
    name: templateName,
    language: { code: 'pt_BR' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: contactName },
        { type: 'text', text: contactPhone }
      ]
    }]
  }
};
```

---

## 📁 GERENCIAMENTO DE MÍDIA

### Tipos Suportados
- **Imagens**: JPEG, PNG, GIF, WebP
- **Vídeos**: MP4, AVI, MOV, WMV, QuickTime
- **Áudios**: MP3, WAV, OGG, MPEG
- **Documentos**: Qualquer tipo (até 100MB)

### Limites WhatsApp
- **Imagens**: 5MB (JPEG, PNG)
- **Vídeos**: 16MB (MP4, 3GPP)
- **Áudios**: 16MB (AAC, MP4, MPEG, AMR, OGG)
- **Documentos**: 100MB

### Upload de Arquivo
```javascript
// Upload via API
const formData = new FormData();
formData.append('media', file);

const response = await fetch('/api/upload-media', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

// Resposta
{
  "success": true,
  "file": {
    "id": "1705123456789",
    "originalname": "imagem.jpg",
    "filename": "temp_1705123456789.jpg",
    "path": "/app/uploads/media/temp_1705123456789.jpg",
    "mimetype": "image/jpeg",
    "size": 1024000
  }
}
```

### Envio de Mídia
```javascript
// Envio com anexo
await sendChatwootMessageWithAttachment(
  conversationId,
  "Aqui está o arquivo:",
  buttons,
  {
    path: "/app/uploads/media/arquivo.pdf",
    originalname: "documento.pdf",
    mimetype: "application/pdf"
  }
);

// Envio via URL pública
await sendChatwootMessageWithAttachmentUrl(
  conversationId,
  "Arquivo compartilhado:",
  buttons,
  {
    url: "https://workflows.inovaianalytics.com.br/public-preview/1705123456789",
    originalname: "imagem.jpg",
    mimetype: "image/jpeg",
    file_id: "1705123456789"
  }
);
```

### Preview Público
```
GET /public-preview/1705123456789
```
- Acesso público sem autenticação
- Cache de 1 hora
- Suporte a imagens e vídeos

---

## ⌨️ COMANDOS ESPECIAIS

### Comandos do Usuário

#### `!reset`
- **Função**: Reiniciar fluxo completo
- **Ação**: Remove conversa, labels e reativa bot
- **Resposta**: "Fluxo reiniciado com sucesso"

#### `!activebot`
- **Função**: Reativar bot manualmente
- **Ação**: Remove pausa do bot
- **Resposta**: "Bot reativado com sucesso!"

#### `!pausebot`
- **Função**: Pausar bot manualmente
- **Ação**: Pausa bot para atendimento humano
- **Resposta**: "Bot pausado com sucesso!"

#### `!botstatus`
- **Função**: Verificar status do bot
- **Resposta**: Status atual e comandos disponíveis

#### `!reload`
- **Função**: Recarregar workflows do banco
- **Ação**: Atualiza cache de workflows
- **Resposta**: "Workflows recarregados com sucesso!"

#### `!workflows`
- **Função**: Listar workflows disponíveis
- **Resposta**: Lista de todos os workflows no cache

### Comandos Administrativos

#### Via API
```javascript
// Reset via API
POST /api/workflow/conversation/:contactId/reset
{
  "conversationId": 123
}

// Atribuir a membro do time
POST /api/workflow/conversations/:conversationId/assign-team-member
{
  "teamId": 1,
  "strategy": "round_robin"
}
```

---

## 🔗 WEBHOOKS E INTEGRAÇÕES

### Webhook WhatsApp

#### Endpoint de Verificação
```
GET /test-webhook?hub.mode=subscribe&hub.challenge=123&hub.verify_token=d37e425f60d78187e521de0bc7e070c3
```

#### Endpoint de Recebimento
```
POST /test-webhook
```

#### Payload de Exemplo
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "1087815663310028",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+553133700909",
          "phone_number_id": "755748160947577"
        },
        "contacts": [{
          "profile": { "name": "Usuário" },
          "wa_id": "5511999999999"
        }],
        "messages": [{
          "from": "5511999999999",
          "id": "wamid.123",
          "timestamp": "1705123456",
          "type": "text",
          "text": { "body": "Olá" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### Simulação de Webhook
```
POST /simulate-webhook-553133700909
```
- Envia webhook simulado para testes
- Usa dados fictícios
- Encaminha para Chatwoot

### Integração Chatwoot

#### Polling Automático
- **Intervalo**: 5 segundos
- **Escopo**: Todas as contas disponíveis
- **Processamento**: Mensagens não processadas

#### Processamento de Mensagens
```javascript
// Verificar se mensagem já foi processada
const isProcessed = await isMessageProcessed(messageId);

// Marcar como processada
await markMessageAsProcessed(messageId, contactId);

// Processar apenas mensagens do usuário
if (message.message_type === 0) {
  await processUserMessage(contactId, conversationId, message.content, inboxId, accountId);
}
```

---

## 📊 MONITORAMENTO E HEALTH CHECKS

### Health Check
```
GET /health
```

#### Resposta
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "polling_active": true,
  "last_message_id": 12345
}
```

### Verificação de Banco de Dados
```
POST /api/campaigns/check-database
{
  "campaignId": 123
}
```

#### Resposta
```json
{
  "success": true,
  "checks": {
    "timestamp": "2024-01-15T10:30:45.123Z",
    "campaignId": 123,
    "database": "Configurado",
    "tables": {
      "existing": ["campaigns", "campaign_contacts", "campaign_status"],
      "missing": []
    },
    "campaign": {
      "exists": true,
      "data": { /* dados da campanha */ }
    },
    "contacts": {
      "total": 100,
      "sample": [/* amostra de contatos */]
    },
    "status": {
      "total_records": 100,
      "by_status": {
        "sent": 80,
        "failed": 10,
        "pending": 10
      }
    }
  }
}
```

### Logs de Sistema
- **Inicialização**: Status de todos os componentes
- **Polling**: Contadores de mensagens processadas
- **Campanhas**: Progresso de envio
- **Erros**: Detalhes completos de falhas

---

## 🔧 TROUBLESHOOTING

### Problemas Comuns

#### 1. Bot não responde
```javascript
// Verificar status do bot
const status = await getBotConversationStatus(conversationId, contactId);
console.log('Bot ativo:', status.bot_active);
console.log('Motivo da pausa:', status.paused_reason);

// Reativar bot
await reactivateBotForConversation(conversationId, contactId, 'manual');
```

#### 2. Workflow não carrega
```javascript
// Recarregar workflows
await conversationManager.loadWorkflowsFromDatabase();

// Verificar workflows disponíveis
const workflows = Array.from(conversationManager.workflows.keys());
console.log('Workflows:', workflows);
```

#### 3. Campanha com erro
```javascript
// Verificar detalhes do erro
const errors = await pool.query(`
  SELECT error_message, COUNT(*) as count 
  FROM campaign_status 
  WHERE campaign_id = $1 AND status = 'failed' 
  GROUP BY error_message
`, [campaignId]);

// Reenviar falhas
await pool.query(`
  UPDATE campaign_status 
  SET status = 'pending', error_message = NULL 
  WHERE campaign_id = $1 AND status = 'failed'
`, [campaignId]);
```

#### 4. Arquivo não envia
```javascript
// Verificar validação do arquivo
const validation = validateWhatsAppMedia(attachment);
console.log('Tipo:', validation.mediaType);
console.log('Tamanho:', validation.fileSizeInMB);

// Verificar se arquivo existe
if (!fs.existsSync(attachment.path)) {
  console.error('Arquivo não encontrado:', attachment.path);
}
```

### Logs de Debug
```javascript
// Ativar logs detalhados
console.log('Debug - conversation object:', conversation);
console.log('Debug - workflow name:', conversation.workflow_name);
console.log('Debug - current block:', conversation.current_block);

// Verificar dados do workflow
const workflow = conversationManager.workflows.get(conversation.workflow_name);
console.log('Debug - workflow blocks:', Object.keys(workflow.blocks));
```

### Verificações de Sistema
```javascript
// Verificar conexão com Chatwoot
const response = await axios.get(`${CHATWOOT_BASE_URL}/api/v1/profile`, {
  headers: { 'api_access_token': CHATWOOT_API_TOKEN }
});

// Verificar conexão com banco
const result = await pool.query('SELECT NOW() as current_time');

// Verificar arquivos de log
const logFiles = fs.readdirSync('./logs');
console.log('Arquivos de log:', logFiles);
```

---

## 💡 EXEMPLOS DE USO

### 1. Workflow de Vendas

#### Configuração
```json
{
  "name": "Vendas Automáticas",
  "blocks": {
    "bloco_1": {
      "id": "welcome",
      "name": "Boas-vindas",
      "message": "Olá {{nome}}! Bem-vindo à nossa loja. Como posso ajudá-lo?",
      "buttons": [
        {
          "text": "Ver produtos",
          "next_block": "catalogo",
          "assign_team": 1,
          "assign_team_member": true,
          "assignment_strategy": "least_busy"
        },
        {
          "text": "Falar com vendedor",
          "next_block": "atendimento_humano",
          "assign_team": 1,
          "pause_bot": true
        }
      ]
    },
    "catalogo": {
      "id": "catalogo",
      "name": "Catálogo",
      "message": "Aqui estão nossos produtos em destaque:",
      "media": {
        "type": "image",
        "url": "https://exemplo.com/catalogo.jpg"
      },
      "buttons": [
        {
          "text": "Produto A - R$ 100",
          "next_block": "produto_a",
          "tag": "interesse_produto_a"
        },
        {
          "text": "Produto B - R$ 200",
          "next_block": "produto_b",
          "tag": "interesse_produto_b"
        }
      ]
    },
    "produto_a": {
      "id": "produto_a",
      "name": "Detalhes Produto A",
      "message": "Produto A - Descrição completa...",
      "buttons": [
        {
          "text": "Comprar agora",
          "next_block": "finalizar",
          "tag": "compra_produto_a",
          "assign_labels": ["venda_produto_a"],
          "contact_labels": ["cliente_interessado"]
        }
      ]
    },
    "atendimento_humano": {
      "id": "atendimento_humano",
      "name": "Atendimento Humano",
      "message": "Transferindo para um de nossos especialistas...",
      "assign_team": 1,
      "assign_team_member": true,
      "assignment_strategy": "round_robin",
      "pause_bot": true
    },
    "finalizar": {
      "id": "finalizar",
      "name": "Finalização",
      "message": "Obrigado pela preferência! Em breve entraremos em contato."
    }
  }
}
```

### 2. Campanha de Marketing

#### Criação
```javascript
// Criar campanha
const campaign = {
  name: "Campanha Black Friday",
  type: "tag",
  tag_name: "clientes_ativos",
  template_name: "black_friday_promo",
  scheduled_at: "2024-11-29T10:00:00-03:00",
  chatwoot_account_id: 1,
  chatwoot_inbox_id: 2
};

const response = await fetch('/api/campaigns', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(campaign)
});
```

#### Monitoramento
```javascript
// Verificar status da campanha
const status = await fetch(`/api/campaigns/${campaignId}/status`);
const data = await status.json();

console.log(`Enviados: ${data.sent_count}`);
console.log(`Falhas: ${data.failed_count}`);
console.log(`Pendentes: ${data.pending_count}`);
```

### 3. Upload e Envio de Mídia

#### Upload
```javascript
// Upload de arquivo
const formData = new FormData();
formData.append('media', file);

const uploadResponse = await fetch('/api/upload-media', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const { file: uploadedFile } = await uploadResponse.json();
```

#### Envio
```javascript
// Enviar mensagem com mídia
const message = {
  conversationId: 123,
  message: "Aqui está o catálogo:",
  buttons: [
    { text: "Ver mais", next_block: "mais_produtos" }
  ],
  mediaContent: {
    attachment: {
      file_id: uploadedFile.id
    }
  }
};

await sendChatwootMessage(
  message.conversationId,
  message.message,
  message.buttons,
  message.mediaContent
);
```

### 4. Controle de Status do Bot

#### Verificação
```javascript
// Verificar se bot deve estar ativo
const shouldBeActive = await isBotActiveForConversation(conversationId, contactId);

if (!shouldBeActive) {
  console.log('Bot pausado - atendimento humano ativo');
  return;
}
```

#### Controle Manual
```javascript
// Pausar bot
await pauseBotForConversation(conversationId, contactId, 'manual_pause', 'admin');

// Reativar bot
await reactivateBotForConversation(conversationId, contactId, 'user_request');
```

---

## 📋 CONCLUSÃO

O Sistema de Fluxo de Chatbot é uma solução robusta e completa para automação de atendimento via WhatsApp. Com suas funcionalidades avançadas de workflows, campanhas, controle de status e integração com múltiplas plataformas, oferece uma base sólida para implementação de chatbots empresariais.

### Principais Vantagens
- ✅ **Flexibilidade**: Workflows customizáveis e dinâmicos
- ✅ **Escalabilidade**: Suporte a múltiplas contas e caixas de entrada
- ✅ **Inteligência**: Atribuição automática e controle de status
- ✅ **Monitoramento**: Logs detalhados e health checks
- ✅ **Integração**: APIs oficiais do WhatsApp e Chatwoot
- ✅ **Segurança**: Autenticação e autorização por conta

### Próximos Passos
1. Configurar variáveis de ambiente
2. Inicializar banco de dados
3. Criar workflows personalizados
4. Configurar campanhas de marketing
5. Monitorar logs e performance

Para suporte adicional, consulte os logs do sistema e utilize os endpoints de health check para diagnóstico de problemas.
