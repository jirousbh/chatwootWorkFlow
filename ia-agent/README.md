# Agente IA - Chatwoot Workflows

Sistema de agentes IA que permite criar assistentes baseados em documentos PDF, integrado ao sistema de workflows do Chatwoot.

## 🚀 Funcionalidades

- **Criação de Agentes**: Crie agentes IA personalizados com prompts específicos
- **Upload de PDFs**: Processe documentos PDF e crie vectorstores automaticamente
- **Integração Groq**: Utilize modelos da Groq (Llama 3.1) para respostas rápidas
- **Resumo Automático**: Gere resumos dos documentos na primeira interação
- **Banco de Dados**: Armazenamento persistente das configurações dos agentes
- **API RESTful**: Interface completa para integração com outros sistemas

## 📋 Parâmetros do Agente

Ao criar um agente, você pode configurar:

- **Nome do agente**: Identificador amigável
- **API Provider**: Atualmente suporta Groq
- **Modelo**: Modelo específico da Groq (ex: llama-3.1-8b-instant)
- **Summary Prompt**: Prompt usado para gerar resumo do documento
- **Custom System Prompt**: Prompt personalizado para respostas
- **Arquivo PDF**: Documento base para o agente

## 🛠️ Instalação e Configuração

### 1. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp env-example ../env-ia-agent-dev

# Editar e configurar sua GROQ_API_KEY
nano ../env-ia-agent-dev
```

### 2. Executar Setup Automático

```bash
./setup.sh
```

### 3. Iniciar o Serviço

```bash
# A partir do diretório raiz do projeto
docker-compose -f docker-compose-dev.yaml up ia-agent-dev --build
```

## 📡 API Endpoints

### Health Check
```http
GET /health
```

### Listar Modelos Disponíveis
```http
GET /models?provider=groq
```

### Listar Agentes
```http
GET /agents
```

### Criar Agente
```http
POST /agents
Content-Type: application/json

{
  "name": "Meu Agente",
  "api_provider": "groq",
  "model": "llama-3.1-8b-instant",
  "summary_prompt": "Analise este documento e crie um resumo conciso dos pontos principais.",
  "custom_system_prompt": "Você é um assistente especializado. Responda em português brasileiro baseado no contexto fornecido."
}
```

### Upload de PDF
```http
POST /agents/{agent_id}/upload-pdf
Content-Type: multipart/form-data

pdf_file: [arquivo.pdf]
```

### Conversar com Agente
```http
POST /agents/{agent_id}/chat
Content-Type: application/json

{
  "message": "Qual é o assunto principal do documento?",
  "is_first_interaction": false
}
```

### Gerar Resumo (Primeira Interação)
```http
POST /agents/{agent_id}/chat
Content-Type: application/json

{
  "message": "",
  "is_first_interaction": true
}
```

### Obter Detalhes do Agente
```http
GET /agents/{agent_id}
```

### Download do PDF
```http
GET /agents/{agent_id}/pdf
```

### Desativar Agente
```http
DELETE /agents/{agent_id}
```

## 🔧 Modelos Disponíveis

A API lista automaticamente os modelos disponíveis na Groq:

- `llama-3.1-8b-instant`: Rápido e eficiente
- `llama-3.1-70b-versatile`: Modelo avançado
- `llama-3.1-gemma-7b-it`: Equilibrado
- `llama-3.1-sonar-small-128k-online`: Otimizado para busca
- `llama-3.1-sonar-large-128k-online`: Modelo grande para busca

## 📁 Estrutura de Arquivos

```
ia-agent/
├── app.py                 # Aplicação Flask principal
├── agent_manager.py       # Gerenciador de agentes e vectorstores
├── groq_client.py         # Cliente para API da Groq
├── requirements.txt       # Dependências Python
├── Dockerfile            # Configuração Docker
├── setup.sh              # Script de setup
├── create-database.sql   # Script SQL para criar banco
├── env-example           # Exemplo de variáveis de ambiente
└── README.md             # Esta documentação
```

## 🗄️ Banco de Dados

O sistema utiliza o banco `workflows_iaagent` no PostgreSQL existente, com a tabela `agent` para armazenar:

- Configurações dos agentes
- Caminhos dos vectorstores
- Metadados dos PDFs
- Timestamps de criação/atualização

## 📊 Armazenamento

Os dados físicos são armazenados em `/data/ia-agent-dev/`:

```
data/ia-agent-dev/
├── {agent_id}/
│   ├── documento.pdf
│   └── vectorstore/
│       ├── index.faiss
│       └── index.pkl
```

## 🔒 Segurança

- Upload limitado a 50MB
- Validação de tipos de arquivo (apenas PDF)
- Sanitização de nomes de arquivo
- Soft delete para agentes (não remove dados)

## 🐛 Troubleshooting

### Erro de Conexão com Groq
- Verifique se `GROQ_API_KEY` está configurada corretamente
- Teste a conectividade: `curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models`

### Erro de Banco de Dados
- Verifique se o PostgreSQL está rodando
- Execute o script `create-database.sql` manualmente se necessário

### Erro de Vectorstore
- Verifique se o PDF foi processado corretamente
- Confirme se há espaço em disco suficiente

## 📈 Monitoramento

- Logs da aplicação disponíveis via Docker logs
- Health check endpoint para monitoramento
- Timestamps de criação/atualização nos agentes

## 🔄 Integração com Workflows

O agente IA pode ser integrado aos workflows existentes através da API REST, permitindo:

- Criação dinâmica de agentes
- Processamento de documentos em workflows
- Respostas automáticas baseadas em documentos
- Integração com o sistema de conversas do Chatwoot
