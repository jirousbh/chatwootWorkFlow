# Chatwoot + Sistema de Workflows de Chatbot

Este projeto combina o Chatwoot (sistema de atendimento) com um sistema de workflows de chatbot interativo para WhatsApp, **usando o mesmo servidor PostgreSQL, mas bancos separados** para máxima organização e segurança.

## 🏗️ Estrutura do Projeto

```
chatwoot/
├── docker-compose.yaml          # Docker Compose unificado
├── .envinovai                   # Configurações do Chatwoot
├── env-workflows                # Configurações dos Workflows (arquivo de ambiente principal)
├── nignx.conf                   # Configuração Nginx principal
├── start-workflows.sh           # Script para iniciar workflows
├── stop-workflows.sh            # Script para parar workflows
├── test-system.sh               # Script para testar sistema
├── check-database.sh            # Script para verificar banco
├── workflows/                   # Sistema de Workflows (código e configs)
│   ├── chatbot-workflow-system.js
│   ├── package.json
│   ├── Dockerfile
│   ├── README.md
│   └── setup-instructions.md
└── data/                        # Dados persistentes
    ├── postgres/                # Banco PostgreSQL (compartilhado)
    ├── redis/
    ├── storage/
    └── workflows-logs/
```

## 🚀 Início Rápido

### 1. Iniciar Chatwoot
```bash
docker-compose up -d
```

### 2. Configurar Workflows
```bash
# Edite o arquivo de ambiente do workflows
nano env-workflows
```

#### Exemplo de env-workflows:
```env
# Configurações do Sistema de Workflows
CHATWOOT_API_TOKEN=seu_token_da_api_chatwoot
WHATSAPP_API_TOKEN=seu_token_whatsapp_business
WHATSAPP_PHONE_ID=seu_phone_number_id

# Configurações do PostgreSQL (banco separado para workflows)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=chatwoot_workflows
POSTGRES_USER=postgres
POSTGRES_PASSWORD=invoAI@76825

# Configurações do servidor de workflows
WORKFLOWS_PORT=3001
```

- **Importante:** O banco de dados do workflows (`chatwoot_workflows`) deve ser criado manualmente no mesmo servidor PostgreSQL do Chatwoot:

```bash
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE chatwoot_workflows;"
```

### 3. Iniciar Sistema de Workflows
```bash
./start-workflows.sh
```

### 4. Verificar Instalação
```bash
./test-system.sh
./check-database.sh
```

## 📚 Documentação detalhada
- O arquivo de ambiente do workflows é **sempre** `env-workflows` na raiz do projeto.
- O banco de dados do workflows é **separado** do Chatwoot, mas ambos usam o mesmo servidor PostgreSQL (container `postgres`).
- O código, exemplos e instruções detalhadas estão em `workflows/`.

## 🛠️ Dicas
- Para restaurar ou fazer backup, basta incluir ambos os bancos (`chatwoot` e `chatwoot_workflows`).
- Para rodar localmente, basta garantir que o arquivo `env-workflows` está correto e o banco existe.

Se precisar de mais exemplos de configuração, integração ou automação, consulte o `workflows/README.md` ou peça ajuda aqui!

## 📱 Funcionalidades

### Chatwoot
- ✅ Sistema de atendimento completo
- ✅ Integração com WhatsApp
- ✅ Interface web
- ✅ API REST

### Sistema de Workflows
- ✅ Fluxos de conversa com botões interativos
- ✅ Integração com WhatsApp Business API
- ✅ Aplicação automática de tags
- ✅ **Persistência no PostgreSQL** (mesmo banco do Chatwoot)
- ✅ Histórico completo de interações
- ✅ Variáveis dinâmicas
- ✅ Webhooks
- ✅ Estatísticas e relatórios

## 🗄️ Banco de Dados

O sistema usa o **mesmo PostgreSQL do Chatwoot**, criando as seguintes tabelas:

### Tabelas do Sistema de Workflows
- `workflow_conversations` - Conversas ativas e finalizadas
- `workflow_interactions` - Histórico detalhado de interações
- `workflow_configs` - Configurações dos workflows

### Vantagens da Integração
- ✅ **Dados unificados** - Backup único
- ✅ **Transações consistentes** - Integridade garantida
- ✅ **Menos recursos** - Um banco só
- ✅ **Facilita manutenção** - Administração centralizada

## 🔧 Configuração

### Variáveis de Ambiente

#### Chatwoot (.envinovai)
```env
# Configurações existentes do Chatwoot
SECRET_KEY_BASE=...
FRONTEND_URL=...
# ... outras configurações
```

#### Workflows (env-workflows)
```env
CHATWOOT_API_TOKEN=seu_token_da_api_chatwoot
WHATSAPP_API_TOKEN=seu_token_whatsapp_business
WHATSAPP_PHONE_ID=seu_phone_number_id

# PostgreSQL (mesmo banco do Chatwoot)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=chatwoot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=invoAI@76825

WORKFLOWS_PORT=3001
```

## 🌐 URLs de Acesso

- **Chatwoot**: https://crm.inovaianalytics.com.br
- **Workflows API**: http://localhost:3001
- **Webhook WhatsApp**: https://crm.inovaianalytics.com.br/webhook/whatsapp
- **Health Check**: http://localhost:3001/health
- **Estatísticas**: http://localhost:3001/api/stats

## 📋 Comandos Úteis

### Gerenciamento Geral
```bash
# Iniciar todos os serviços
docker-compose up -d

# Parar todos os serviços
docker-compose down

# Ver logs
docker-compose logs -f
```

### Gerenciamento de Workflows
```bash
# Iniciar apenas workflows
./start-workflows.sh

# Parar apenas workflows
./stop-workflows.sh

# Ver logs dos workflows
docker-compose logs -f chatbot-workflows

# Reconstruir workflows
docker-compose build chatbot-workflows
```

### Verificação e Testes
```bash
# Testar sistema completo
./test-system.sh

# Verificar banco de dados
./check-database.sh

# Health check da API
curl http://localhost:3001/health

# Ver estatísticas
curl http://localhost:3001/api/stats
```

### Banco de Dados
```bash
# Acessar PostgreSQL
psql -h localhost -p 5490 -U postgres -d chatwoot

# Backup do banco (inclui workflows)
docker-compose exec postgres pg_dump -U postgres chatwoot > backup.sql

# Ver tabelas de workflows
docker-compose exec postgres psql -U postgres -d chatwoot -c "\dt workflow_*"
```

## 🔍 Monitoramento

### Status dos Serviços
```bash
# Verificar status
docker-compose ps

# Verificar recursos
docker stats
```

### Logs
```bash
# Logs do Chatwoot
docker-compose logs -f rails

# Logs dos Workflows
docker-compose logs -f chatbot-workflows

# Logs do PostgreSQL
docker-compose logs -f postgres
```

### Estatísticas do Sistema
```bash
# Ver estatísticas via API
curl http://localhost:3001/api/stats

# Ver conversas ativas
docker-compose exec postgres psql -U postgres -d chatwoot -c "SELECT COUNT(*) FROM workflow_conversations WHERE status = 'active';"

# Ver histórico de interações
docker-compose exec postgres psql -U postgres -d chatwoot -c "SELECT COUNT(*) FROM workflow_interactions;"
```

## 🛠️ Desenvolvimento

### Estrutura dos Workflows
Os workflows estão definidos em `workflows/chatbot-workflow-system.js` e **salvos no banco**:

```javascript
const defaultWorkflows = {
  'fluxo_comercial': {
    name: 'Fluxo Comercial',
    blocks: {
      'bloco_1': {
        message: 'Oi {{nome}}! Como posso te ajudar?',
        buttons: [
          { text: 'Sim', next_block: 'bloco_2' },
          { text: 'Não', next_block: 'finalizar', tag: 'lead_frio' }
        ]
      }
    }
  }
}
```

### Adicionar Novo Fluxo
1. Edite `workflows/chatbot-workflow-system.js`
2. Adicione o novo fluxo na variável `defaultWorkflows`
3. Reinicie o serviço: `docker-compose restart chatbot-workflows`
4. O fluxo será automaticamente salvo no banco

### APIs Disponíveis
```bash
# Iniciar workflow
POST /api/workflow/start
{
  "contactId": "123456789",
  "workflowName": "fluxo_comercial",
  "initialData": {"nome": "João"}
}

# Ver conversa
GET /api/conversation/123456789

# Ver estatísticas
GET /api/stats

# Salvar workflow
POST /api/workflows
{
  "name": "meu_fluxo",
  "config": {...}
}
```

## 🔒 Segurança

- Tokens de API em arquivos separados
- Rede Docker isolada
- Logs de auditoria
- Validação de webhooks
- **Dados persistentes no PostgreSQL**

## 🚨 Troubleshooting

### Problemas Comuns

**Chatwoot não inicia**
```bash
# Verificar logs
docker-compose logs rails

# Verificar banco de dados
docker-compose logs postgres
```

**Workflows não funcionam**
```bash
# Verificar configuração
cat env-workflows

# Verificar logs
docker-compose logs chatbot-workflows

# Verificar banco
./check-database.sh

# Testar API
curl http://localhost:3001/health
```

**Erro de conexão com banco**
```bash
# Verificar se PostgreSQL está rodando
docker-compose ps postgres

# Verificar logs do PostgreSQL
docker-compose logs postgres

# Verificar tabelas
./check-database.sh
```

**WhatsApp não recebe mensagens**
- Verificar webhook no Meta for Developers
- Confirmar se a URL está acessível publicamente
- Verificar tokens de API

## 📊 Backup e Restore

### Backup Completo
```bash
# Backup do banco (inclui Chatwoot + Workflows)
docker-compose exec postgres pg_dump -U postgres chatwoot > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup dos dados
tar -czf data_backup_$(date +%Y%m%d_%H%M%S).tar.gz data/
```

### Restore
```bash
# Restore do banco
docker-compose exec -T postgres psql -U postgres -d chatwoot < backup.sql

# Restore dos dados
tar -xzf data_backup.tar.gz
```

## 📚 Documentação

- **Chatwoot**: https://www.chatwoot.com/docs
- **Workflows**: `workflows/README.md`
- **Configuração**: `workflows/setup-instructions.md`
- **Exemplos**: `workflows/workflow-examples.json`

## 🤝 Suporte

- Email: suporte@inovaianalytics.com.br
- Documentação: [Link para docs]
- Issues: [Link para GitHub]

## 📄 Licença

MIT License - veja o arquivo LICENSE para detalhes. 